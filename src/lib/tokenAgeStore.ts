/**
 * DB-backed token "Age" (creation time) store.
 *
 * The trending list reads Age from our own `token_creation` table instead of
 * calling an external API per token in the render path. A token is looked up
 * externally at most once per `NULL_RETRY_MS`, then served from the DB:
 *   - found  → `createdAtUnix` = seconds (immutable, kept forever)
 *   - not found → `createdAtUnix` = null (recorded so we don't re-hammer the
 *                 upstream every request; re-checked after the retry window)
 * We never overwrite a found value with null (a transient failure can't erase a
 * real Age).
 */
import { prisma } from "@/lib/prisma";

export type TokenRef = { chain: string; address: string };
export type AgeRecord = { createdAtUnix: number | null; checkedAt: Date };

const normChain = (c: string) => (c || "solana").trim().toLowerCase();
export const ageKey = (chain: string, address: string) =>
  `${normChain(chain)}:${address}`;

/** Re-check "unknown" (null) tokens at most this often. */
export const NULL_RETRY_MS = 24 * 60 * 60 * 1000; // 24h

/** Batch-read age records from the DB, keyed by `${chain}:${address}`. */
export async function readAgeRecordsFromDb(
  tokens: TokenRef[],
): Promise<Map<string, AgeRecord>> {
  const map = new Map<string, AgeRecord>();
  const uniq = new Map<string, TokenRef>();
  for (const t of tokens) {
    if (!t?.address) continue;
    uniq.set(ageKey(t.chain, t.address), {
      chain: normChain(t.chain),
      address: t.address,
    });
  }
  const list = [...uniq.values()];
  if (!list.length) return map;
  try {
    const rows = await prisma.tokenCreation.findMany({
      where: { OR: list.map((t) => ({ chain: t.chain, address: t.address })) },
      select: { chain: true, address: true, createdAtUnix: true, checkedAt: true },
    });
    for (const r of rows) {
      map.set(`${r.chain}:${r.address}`, {
        createdAtUnix: r.createdAtUnix,
        checkedAt: r.checkedAt,
      });
    }
  } catch {
    /* DB read failure → empty map; callers fall back to the external lookup */
  }
  return map;
}

/** Whether a DB record lets us skip the external lookup (found, or recently checked-unknown). */
export function ageRecordCovers(rec: AgeRecord | undefined): boolean {
  if (!rec) return false;
  if (typeof rec.createdAtUnix === "number") return true;
  return Date.now() - rec.checkedAt.getTime() < NULL_RETRY_MS;
}

/**
 * Persist lookup results (found numbers AND checked-unknown nulls). Best-effort,
 * never throws into the request path. A null result only refreshes `checkedAt`
 * on an existing row — it never overwrites a previously-found `createdAtUnix`.
 */
export async function saveAges(
  entries: Array<{ chain: string; address: string; createdAtUnix: number | null; source?: string }>,
): Promise<void> {
  const seen = new Set<string>();
  const ops: Array<Promise<unknown>> = [];
  const now = new Date();
  for (const e of entries) {
    if (!e?.address) continue;
    const chain = normChain(e.chain);
    const key = `${chain}:${e.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const val = typeof e.createdAtUnix === "number" ? e.createdAtUnix : null;
    const update =
      val === null
        ? { checkedAt: now } // don't clobber an existing found value
        : { createdAtUnix: val, source: e.source ?? null, checkedAt: now };
    ops.push(
      prisma.tokenCreation
        .upsert({
          where: { chain_address: { chain, address: e.address } },
          create: { chain, address: e.address, createdAtUnix: val, source: e.source ?? null, checkedAt: now },
          update,
        })
        .catch(() => null),
    );
  }
  if (!ops.length) return;
  try {
    await Promise.all(ops);
  } catch {
    /* best-effort */
  }
}

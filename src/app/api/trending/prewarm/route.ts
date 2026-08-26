/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pre-warms every view a user can switch to, so the first click is instant
 * (never a cold cache): each chain's trending list + its sparklines, and the
 * Golden/Pump Reports lists + their sparklines. Meant to be called by a Vercel
 * cron every minute. Reads/caches only — no DB writes.
 *
 * The expensive cold cost is the Birdeye token list (cached 20s). Age and Dex
 * mcap overlay are follow-up requests after the table paints. Keeping the list
 * warm turns first load / chain clicks into fast cached reads.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CHAINS = ["solana", "robinhood", "ethereum", "base", "bsc", "monad"] as const;
const PAGE_SIZE = 25;
// Warm the first few pages so paginating (offset 25, 50, …) is instant, not just page 1.
const PAGE_OFFSETS = [0, 25, 50, 75];

function defaultBody(chain: string, offset = 0) {
  return {
    limit: PAGE_SIZE,
    offset,
    chain,
    sort_by: "v24hUSD",
    sort_type: "desc",
    min_liquidity: 100,
    ui_amount_mode: "scaled",
    verified_only: false,
    include_creation: false,
    creation_concurrency: 6,
  };
}

function tokensFromItems(items: any[], fallbackChain: string) {
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      chain: it?.chainId || it?.chain || fallbackChain,
      address: it?.tokenAddress || it?.contractAddress || it?.address,
    }))
    .filter((t) => t.address);
}

async function warmSparklines(origin: string, tokens: { chain: string; address: string }[]) {
  if (!tokens.length) return 0;
  const res = await fetch(`${origin}/api/trending/sparklines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tokens }),
    cache: "no-store",
  });
  return res.status;
}

async function warmChain(origin: string, chain: string) {
  const t0 = Date.now();
  try {
    // Warm the first N pages sequentially (populates the per-offset list cache).
    let firstPageItems: any[] = [];
    const statuses: number[] = [];
    for (const offset of PAGE_OFFSETS) {
      const res = await fetch(`${origin}/api/trending`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(defaultBody(chain, offset)),
        cache: "no-store",
      });
      statuses.push(res.status);
      const json: any = res.ok ? await res.json() : null;
      const items = json?.items ?? [];
      if (offset === 0) firstPageItems = items;
      if (!items.length) break; // no more pages
    }
    const spark = await warmSparklines(origin, tokensFromItems(firstPageItems, chain));
    return {
      kind: `chain:${chain}`,
      pages: statuses,
      items: firstPageItems.length,
      spark,
      ms: Date.now() - t0,
    };
  } catch (err: any) {
    return { kind: `chain:${chain}`, error: String(err?.message || err), ms: Date.now() - t0 };
  }
}

async function warmReport(origin: string, kind: "golden" | "pump") {
  const t0 = Date.now();
  try {
    const res = await fetch(`${origin}/api/${kind}-reports/screener-tokens`, { cache: "no-store" });
    const json: any = res.ok ? await res.json() : null;
    const items = json?.items ?? json?.tokens ?? [];
    const spark = await warmSparklines(origin, tokensFromItems(items, "solana"));
    return { kind: `report:${kind}`, status: res.status, items: items.length, spark, ms: Date.now() - t0 };
  } catch (err: any) {
    return { kind: `report:${kind}`, error: String(err?.message || err), ms: Date.now() - t0 };
  }
}

/** Run tasks with limited concurrency so we don't burst Birdeye into 429s. */
async function runLimited<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function GET(request: NextRequest) {
  // Guard: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Also allow
  // `?secret=<CRON_SECRET>` for manual warming. If CRON_SECRET is unset, allow (dev).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const qp = new URL(request.url).searchParams.get("secret");
    if (auth !== `Bearer ${secret}` && qp !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const origin = new URL(request.url).origin;
  const startedAll = Date.now();

  const tasks = [
    ...CHAINS.map((c) => () => warmChain(origin, c)),
    () => warmReport(origin, "golden"),
    () => warmReport(origin, "pump"),
  ];

  // Concurrency 2 keeps at most ~2 Birdeye list calls in flight → avoids the 429s
  // seen when warming every chain's pages at once. Still finishes well under a minute.
  const warmed = await runLimited(
    tasks.map((t) => async () => {
      try {
        return await t();
      } catch (e) {
        return { error: String(e) };
      }
    }),
    2,
  );

  return NextResponse.json({ ok: true, totalMs: Date.now() - startedAll, warmed });
}

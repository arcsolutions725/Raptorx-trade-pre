/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Birdeye `token_creation_info` (via Uniblock) — same enrichment as `/api/trending`.
 * `token_overview` often omits creation time; this endpoint supplies `blockUnixTime`.
 */

import { tryDexscreenerEarliestPairCreatedSeconds } from "@/lib/api/dexscreener";

const UNIBLOCK_BIRDEYE_BASE = "https://api.uniblock.dev/direct/v1/Birdeye";
const BIRDEYE_CREATION = `${UNIBLOCK_BIRDEYE_BASE}/defi/token_creation_info`;

// WSOL / NATIVE_MINT (approximate: Solana mainnet-beta genesis, 2020-03-16T00:00:00Z)
const KNOWN_CREATION_TIMES: Record<string, number> = {
  so11111111111111111111111111111111111111112: 1584316800,
};

/** Successful Birdeye creation timestamps only (never cache "missing" — 404s were poisoning Age after transient indexer gaps). */
const CREATION_CACHE = new Map<string, number>();

function coerceFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return undefined;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Birdeye sometimes returns epoch in milliseconds instead of seconds.
 * Detect and normalise to seconds.
 */
export function normalizeEpochToSeconds(v: unknown): number | undefined {
  const n = coerceFiniteNumber(v);
  if (n === undefined) return undefined;
  if (n > 1e15) return undefined;
  // Milliseconds: values after year-2001 in ms are > 978307200000 ≈ 1e12
  if (n > 1e12) return Math.floor(n / 1000);
  return n;
}

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    if (queue.length) queue.shift()!();
  };
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          next();
        }
      };
      if (active < concurrency) start();
      else queue.push(start);
    });
  };
}

/** Unwrap Uniblock/Birdeye `token_creation_info` payload — `data` may be object, array, or nested. */
function unwrapCreationRecord(json: any): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  let d: unknown = (json as { data?: unknown }).data;
  if (d == null && typeof (json as { blockUnixTime?: unknown }).blockUnixTime === "number") {
    return json as Record<string, unknown>;
  }
  for (let depth = 0; depth < 3 && d != null; depth++) {
    if (Array.isArray(d)) {
      const first = d.find((x) => x && typeof x === "object");
      d = first ?? null;
      continue;
    }
    if (typeof d === "object") {
      const o = d as Record<string, unknown>;
      const inner = o.data;
      if (inner != null && typeof inner === "object") {
        d = inner;
        continue;
      }
      return o;
    }
    return null;
  }
  return typeof d === "object" && d != null ? (d as Record<string, unknown>) : null;
}

function creationUnixFromRecord(d: Record<string, unknown> | null): number | undefined {
  if (!d) return undefined;
  let created =
    normalizeEpochToSeconds(d.blockUnixTime) ??
    normalizeEpochToSeconds(d.block_unix_time) ??
    normalizeEpochToSeconds(d.timestamp) ??
    normalizeEpochToSeconds(d.blockTime) ??
    normalizeEpochToSeconds(d.createdAt) ??
    normalizeEpochToSeconds(d.blockTimestamp) ??
    normalizeEpochToSeconds(d.unixTime) ??
    normalizeEpochToSeconds(d.txUnixTime) ??
    normalizeEpochToSeconds(d.openTimestamp) ??
    normalizeEpochToSeconds(d.created_at) ??
    normalizeEpochToSeconds(d.time);

  if (typeof created !== "number" || !Number.isFinite(created)) {
    const humanRaw =
      typeof d.blockHumanTime === "string"
        ? d.blockHumanTime
        : typeof d.block_human_time === "string"
          ? d.block_human_time
          : undefined;
    if (humanRaw) {
      const ms = Date.parse(humanRaw);
      if (Number.isFinite(ms)) {
        created = Math.floor(ms / 1000);
      }
    }
  }

  return typeof created === "number" && Number.isFinite(created) ? created : undefined;
}

type CreationTryKind =
  | { kind: "ok"; t: number }
  | { kind: "not_found" }
  | { kind: "no_timestamp" }
  | { kind: "retry"; waitMs?: number };

async function fetchCreationInfo(
  address: string,
  chain: string,
  apiKey: string,
  timeoutMs = 10_000,
  maxTransientRetries = 4,
  maxSoftTimestampTries = 3
): Promise<number | undefined> {
  if (!address) return undefined;

  const cacheKey = `${chain}:${address}`;

  if (chain.toLowerCase() === "solana") {
    const known = KNOWN_CREATION_TIMES[address.toLowerCase()];
    if (typeof known === "number") {
      CREATION_CACHE.set(cacheKey, known);
      return known;
    }
  }

  if (CREATION_CACHE.has(cacheKey)) {
    return CREATION_CACHE.get(cacheKey);
  }

  const url = `${BIRDEYE_CREATION}?address=${encodeURIComponent(address)}`;

  const tryOnce = async (): Promise<CreationTryKind> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-chain": chain,
          "x-api-key": apiKey,
        },
        signal: ctrl.signal,
        cache: "no-store",
      });

      if (res.status === 404) {
        return { kind: "not_found" };
      }
      if (res.status === 401 || res.status === 403) {
        return { kind: "not_found" };
      }
      if (
        res.status === 429 ||
        res.status === 503 ||
        res.status === 502 ||
        res.status === 504
      ) {
        if (res.status === 429) {
          const raHdr = res.headers.get("retry-after");
          const raSec = raHdr ? Number(raHdr) : NaN;
          const waitMs =
            Number.isFinite(raSec) && raSec > 0
              ? Math.min(12_000, raSec * 1000)
              : undefined;
          return { kind: "retry", waitMs };
        }
        return { kind: "retry" };
      }
      if (!res.ok) {
        return { kind: "retry" };
      }

      let json: any;
      try {
        json = await res.json();
      } catch {
        return { kind: "retry" };
      }

      if (json && typeof json === "object" && json.success === false) {
        return { kind: "retry" };
      }

      const rec = unwrapCreationRecord(json);
      const created = creationUnixFromRecord(rec);

      const nowSec = Math.floor(Date.now() / 1000) + 86_400;
      if (
        typeof created === "number" &&
        created > 946684800 &&
        created <= nowSec
      ) {
        CREATION_CACHE.set(cacheKey, created);
        return { kind: "ok", t: created };
      }
      return { kind: "no_timestamp" };
    } catch {
      return { kind: "retry" };
    } finally {
      clearTimeout(timer);
    }
  };

  let transientAttempts = 0;
  let softTsAttempts = 0;

  for (;;) {
    const r = await tryOnce();
    if (r.kind === "ok") return r.t;
    if (r.kind === "not_found") return undefined;

    if (r.kind === "no_timestamp") {
      softTsAttempts++;
      if (softTsAttempts >= maxSoftTimestampTries) return undefined;
      await new Promise((res) =>
        setTimeout(res, Math.min(3500, 280 * softTsAttempts)),
      );
      continue;
    }

    transientAttempts++;
    if (transientAttempts > maxTransientRetries) return undefined;

    const backoff =
      r.kind === "retry" && typeof r.waitMs === "number"
        ? r.waitMs
        : Math.min(6000, 450 * 2 ** (transientAttempts - 1));
    await new Promise((res) => setTimeout(res, backoff));
  }
}

function maxReasonableCreatedSec(): number {
  return Math.floor(Date.now() / 1000) + 86_400;
}

/** Single-chain batch (used by `/api/trending`). */
function hasUsableCreatedAt(item: any): boolean {
  const t = normalizeEpochToSeconds(item?.createdAt);
  return (
    typeof t === "number" &&
    Number.isFinite(t) &&
    t > 946684800 &&
    t <= maxReasonableCreatedSec()
  );
}

async function enrichDexscreenerWhereMissing(
  items: any[],
  concurrency: number,
): Promise<any[]> {
  if (!items.length) return items;

  const addrs: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (hasUsableCreatedAt(it)) continue;
    const addr = (it?.tokenAddress as string | undefined)?.trim();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    addrs.push(addr);
  }
  if (!addrs.length) return items;

  const limiter = createLimiter(Math.max(1, Math.min(concurrency, 4)));
  const times = await Promise.all(
    addrs.map((addr) =>
      limiter(() => tryDexscreenerEarliestPairCreatedSeconds(addr)),
    ),
  );
  const byAddr = new Map<string, number | undefined>();
  addrs.forEach((a, i) => byAddr.set(a, times[i]));

  return items.map((it) => {
    if (hasUsableCreatedAt(it)) {
      const n = normalizeEpochToSeconds(it?.createdAt);
      return typeof n === "number" ? { ...it, createdAt: n } : it;
    }
    const addr = (it?.tokenAddress as string | undefined)?.trim();
    if (!addr) return it;
    const dexT = byAddr.get(addr);
    const fromDex =
      typeof dexT === "number" && hasUsableCreatedAt({ createdAt: dexT })
        ? dexT
        : undefined;
    const existing = normalizeEpochToSeconds(it?.createdAt);
    const chosen =
      fromDex !== undefined
        ? fromDex
        : typeof existing === "number" && hasUsableCreatedAt({ createdAt: existing })
          ? existing
          : undefined;
    return { ...it, createdAt: chosen };
  });
}

export async function enrichWithCreation(
  items: any[],
  chain: string,
  apiKey: string,
  concurrency = 6
) {
  if (!items.length) return items;

  const limiter = createLimiter(concurrency);

  const fetchSet = new Set<string>();
  for (const item of items) {
    const addr = item?.tokenAddress as string | undefined;
    if (!addr) continue;
    if (!hasUsableCreatedAt(item)) fetchSet.add(addr);
  }
  const addressesToFetch = Array.from(fetchSet);

  if (!addressesToFetch.length) {
    return items.map((it) => {
      if (!hasUsableCreatedAt(it)) return it;
      const n = normalizeEpochToSeconds(it?.createdAt);
      return typeof n === "number" ? { ...it, createdAt: n } : it;
    });
  }

  const times = await Promise.all(
    addressesToFetch.map((addr) =>
      limiter(() => fetchCreationInfo(addr, chain, apiKey))
    )
  );

  const byAddr = new Map<string, number | undefined>();
  addressesToFetch.forEach((addr, i) => byAddr.set(addr, times[i]));

  const birdeyeMerged = items.map((it) => {
    const addr = it?.tokenAddress as string | undefined;
    if (!addr) return it;
    const createdFromCreationInfo = byAddr.get(addr);
    const merged =
      typeof createdFromCreationInfo === "number"
        ? createdFromCreationInfo
        : normalizeEpochToSeconds(it?.createdAt);
    return {
      ...it,
      createdAt:
        typeof merged === "number" && hasUsableCreatedAt({ createdAt: merged })
          ? merged
          : undefined,
    };
  });

  return enrichDexscreenerWhereMissing(birdeyeMerged, concurrency);
}

const EVM_FALLBACK_CHAINS = ["ethereum", "bsc", "base", "monad"] as const;

/**
 * Rows may use different `chainId` values (Golden Reports projects). Dedupes by chain + address.
 * After the primary fetch, any EVM tokens still missing creation time are retried
 * against other EVM chains (the Birdeye creation-info endpoint sometimes only has
 * data on a different chain than the one the token was found on via overview).
 */
export async function enrichWithCreationMixedChains(
  items: any[],
  apiKey: string,
  concurrency = 6
) {
  if (!items.length) return items;

  const limiter = createLimiter(concurrency);

  const missingKeys = new Set<string>();
  for (const item of items) {
    const addr = item?.tokenAddress as string | undefined;
    if (!addr) continue;
    const chainRaw = item?.chainId;
    const chain =
      typeof chainRaw === "string" && chainRaw.trim()
        ? chainRaw.trim()
        : "solana";
    const key = `${chain}:${addr}`;
    if (!hasUsableCreatedAt(item)) missingKeys.add(key);
  }

  type Pair = { chain: string; addr: string; key: string };
  const pairs: Pair[] = [];
  const addedKeys = new Set<string>();
  for (const item of items) {
    const addr = item?.tokenAddress as string | undefined;
    if (!addr) continue;
    const chainRaw = item?.chainId;
    const chain =
      typeof chainRaw === "string" && chainRaw.trim()
        ? chainRaw.trim()
        : "solana";
    const key = `${chain}:${addr}`;
    if (!missingKeys.has(key) || addedKeys.has(key)) continue;
    addedKeys.add(key);
    pairs.push({ chain, addr, key });
  }

  if (!pairs.length) {
    return items.map((it) => {
      if (!hasUsableCreatedAt(it)) return it;
      const n = normalizeEpochToSeconds(it?.createdAt);
      return typeof n === "number" ? { ...it, createdAt: n } : it;
    });
  }

  const times = await Promise.all(
    pairs.map((p) =>
      limiter(() => fetchCreationInfo(p.addr, p.chain, apiKey))
    )
  );

  const byKey = new Map<string, number | undefined>();
  pairs.forEach((p, i) => byKey.set(p.key, times[i]));

  // Second pass: for EVM tokens where the primary chain returned nothing,
  // try other EVM chains as fallback.
  const isEvmAddr = (a: string) => /^0x[a-fA-F0-9]{40}$/i.test(a.trim());
  const stillMissing = pairs.filter(
    (p) => byKey.get(p.key) === undefined && isEvmAddr(p.addr),
  );

  if (stillMissing.length > 0) {
    await Promise.all(
      stillMissing.map((p) =>
        limiter(async () => {
          for (const alt of EVM_FALLBACK_CHAINS) {
            if (alt === p.chain) continue;
            const t = await fetchCreationInfo(p.addr, alt, apiKey, 5000, 1, 1);
            if (typeof t === "number") {
              byKey.set(p.key, t);
              return;
            }
          }
        }),
      ),
    );
  }

  const birdeyeMerged = items.map((it) => {
    const addr = it?.tokenAddress as string | undefined;
    if (!addr) return it;
    const chainRaw = it?.chainId;
    const chain =
      typeof chainRaw === "string" && chainRaw.trim()
        ? chainRaw.trim()
        : "solana";
    const key = `${chain}:${addr}`;
    const createdFromCreationInfo = byKey.get(key);
    const merged =
      typeof createdFromCreationInfo === "number"
        ? createdFromCreationInfo
        : normalizeEpochToSeconds(it?.createdAt);
    return {
      ...it,
      createdAt:
        typeof merged === "number" && hasUsableCreatedAt({ createdAt: merged })
          ? merged
          : undefined,
    };
  });

  return enrichDexscreenerWhereMissing(birdeyeMerged, concurrency);
}

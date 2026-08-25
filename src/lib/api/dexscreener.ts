/* eslint-disable @typescript-eslint/no-explicit-any */
const DEXSCREENER_BASE = "https://api.dexscreener.com";

/** Our chain ids → DexScreener chain slugs. Unmapped chains fall back to search. */
export const DEX_CHAIN_SLUG: Record<string, string> = {
  solana: "solana",
  bsc: "bsc",
  "56": "bsc",
  base: "base",
  "8453": "base",
  ethereum: "ethereum",
  eth: "ethereum",
  "1": "ethereum",
  monad: "monad",
  "10143": "monad",
  robinhood: "robinhood",
  "4663": "robinhood",
};

export const toDexChainSlug = (chain?: string | null): string | undefined =>
  chain ? DEX_CHAIN_SLUG[chain.trim().toLowerCase()] : undefined;

/** DexScreener caps `/tokens/v1/{slug}/{addresses}` at 30 addresses per call. */
const TOKENS_V1_BATCH = 30;
const TOKEN_PAIRS_CONCURRENCY = 8;
const TOKEN_PAIRS_TTL_MS = 60_000;

const tokenPairsCache = new Map<
  string,
  { at: number; pairs: DexScreenerPair[] }
>();

function asPairList(data: unknown): DexScreenerPair[] {
  if (Array.isArray(data)) return data as DexScreenerPair[];
  if (data && typeof data === "object" && Array.isArray((data as { pairs?: unknown }).pairs)) {
    return (data as { pairs: DexScreenerPair[] }).pairs;
  }
  return [];
}

async function fetchDexJson(
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Pair data for a set of token addresses on one DexScreener chain.
 *
 * Prefers the batched `/tokens/v1/{slug}/{addr,addr}` endpoint. For Robinhood
 * that batch started returning empty HTTP 200s (Cloudflare then caches the
 * empty body), while `/token-pairs/v1/{slug}/{addr}` still has the pools.
 * Misses on Robinhood are filled per-token and cached briefly so a 5s price
 * refresh does not re-issue hundreds of lookups.
 */
export async function fetchDexScreenerPairsForAddresses(
  slug: string,
  addresses: string[],
  signal?: AbortSignal,
): Promise<DexScreenerPair[]> {
  const unique = [
    ...new Set(
      addresses
        .map((a) => (typeof a === "string" ? a.trim().toLowerCase() : ""))
        .filter(Boolean),
    ),
  ];
  if (!unique.length) return [];

  const out: DexScreenerPair[] = [];
  const haveBase = new Set<string>();
  const take = (pairs: DexScreenerPair[]) => {
    for (const p of pairs) {
      if (p?.chainId !== slug) continue;
      out.push(p);
      const base = String(p?.baseToken?.address ?? "").toLowerCase();
      if (base) haveBase.add(base);
    }
  };

  for (let i = 0; i < unique.length; i += TOKENS_V1_BATCH) {
    const batch = unique.slice(i, i + TOKENS_V1_BATCH);
    const data = await fetchDexJson(
      `${DEXSCREENER_BASE}/tokens/v1/${slug}/${batch.join(",")}`,
      signal,
    );
    take(asPairList(data));
  }

  if (slug !== "robinhood") return out;

  const missing = unique.filter((a) => !haveBase.has(a));
  if (!missing.length) return out;

  const now = Date.now();
  const toFetch: string[] = [];
  for (const a of missing) {
    const key = `${slug}|${a}`;
    const hit = tokenPairsCache.get(key);
    if (hit && now - hit.at < TOKEN_PAIRS_TTL_MS) {
      take(hit.pairs);
    } else {
      toFetch.push(a);
    }
  }

  for (let i = 0; i < toFetch.length; i += TOKEN_PAIRS_CONCURRENCY) {
    const chunk = toFetch.slice(i, i + TOKEN_PAIRS_CONCURRENCY);
    const lists = await Promise.all(
      chunk.map(async (a) => {
        const data = await fetchDexJson(
          `${DEXSCREENER_BASE}/token-pairs/v1/${slug}/${a}`,
          signal,
        );
        if (data == null) return [];
        let pairs = asPairList(data).filter((p) => p?.chainId === slug);
        if (!pairs.length) {
          const generic = await fetchDexJson(
            `${DEXSCREENER_BASE}/latest/dex/tokens/${a}`,
            signal,
          );
          pairs = asPairList(generic).filter((p) => p?.chainId === slug);
        }
        tokenPairsCache.set(`${slug}|${a}`, { at: Date.now(), pairs });
        return pairs;
      }),
    );
    for (const pairs of lists) take(pairs);
  }

  return out;
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative?: string;
  priceUsd?: string;
  volume?: { h24: number; h6: number; h1: number; m5?: number };
  liquidity?: { usd: number; base: number; quote: number };
  txns?: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h6?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  priceChange?: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}

export interface DexScreenerTokenProfile {
  schemaVersion?: string;
  pairs: DexScreenerPair[];
}

export async function getDexscreenerData(
  contractAddress: string,
  chain?: string,
): Promise<DexScreenerPair | { error: string }> {
  try {
    if (!contractAddress) {
      return { error: "Contract address is required" };
    }

    // Chain-scope the lookup whenever the caller knows the chain. `latest/dex/tokens`
    // searches *every* chain, so an address that also exists elsewhere can come back
    // with a pool on the wrong chain — and since DexScreener's `marketCap` is computed
    // per pool, the row's Mcap and the embedded chart would then be reading different
    // pools. `tokens/v1/{slug}` is the same endpoint the table's overlay uses.
    const slug = toDexChainSlug(chain);
    const addr = contractAddress.trim().toLowerCase();
    const pairs: DexScreenerPair[] = slug
      ? await fetchDexScreenerPairsForAddresses(slug, [addr])
      : asPairList(
          await fetchDexJson(
            `${DEXSCREENER_BASE}/latest/dex/tokens/${encodeURIComponent(addr)}`,
          ),
        );

    if (!pairs.length) {
      return { error: "No DexScreener data found" };
    }

    const want = contractAddress.toLowerCase();
    const matching = pairs.filter(
      (p) => String(p?.baseToken?.address ?? "").toLowerCase() === want,
    );
    const pool = matching.length ? matching : pairs;

    // Deepest liquidity = DexScreener's usual main pair (matches table enricher).
    const sortedPairs = [...pool].sort(
      (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    );

    const bestPair = sortedPairs[0];

    return bestPair;
  } catch (err: any) {
    console.error("DexScreener API Error:", err.message || err);
    return { error: "Failed to fetch DexScreener data" };
  }
}

const MAX_PAIR_CREATED_SKEW_SEC = 86_400;

/**
 * Earliest `pairCreatedAt` across DexScreener pools for this token (seconds since epoch).
 * Used when Birdeye omits creation time (common for some Golden/Pump registry tokens).
 */
export async function tryDexscreenerEarliestPairCreatedSeconds(
  contractAddress: string,
): Promise<number | undefined> {
  const addr = contractAddress?.trim();
  if (!addr) return undefined;
  const maxSec = Math.floor(Date.now() / 1000) + MAX_PAIR_CREATED_SKEW_SEC;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `${DEXSCREENER_BASE}/latest/dex/tokens/${encodeURIComponent(addr)}`,
      { cache: "no-store", signal: ctrl.signal },
    );
    if (!res.ok) return undefined;
    const data: DexScreenerTokenProfile = await res.json();
    if (!data?.pairs?.length) return undefined;
    let earliest: number | undefined;
    for (const p of data.pairs) {
      const raw = p?.pairCreatedAt;
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const sec = raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
      if (sec > 946684800 && sec <= maxSec) {
        if (earliest === undefined || sec < earliest) earliest = sec;
      }
    }
    return earliest;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

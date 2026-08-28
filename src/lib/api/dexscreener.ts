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

/**
 * Stable DexScreener token icon. Always constructable from chain + address, so
 * Golden/Pump rows still have an image when Birdeye omits `logoURI`.
 */
export function dexScreenerTokenImageUrl(
  chain?: string | null,
  address?: string | null,
): string | undefined {
  const slug = toDexChainSlug(chain);
  const addr = typeof address === "string" ? address.trim() : "";
  if (!slug || !addr) return undefined;
  const token = addr.startsWith("0x") ? addr.toLowerCase() : addr;
  return `https://dd.dexscreener.com/ds-data/tokens/${slug}/${token}.png`;
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
    const addr = encodeURIComponent(contractAddress);
    const url = slug
      ? `${DEXSCREENER_BASE}/tokens/v1/${slug}/${addr}`
      : `${DEXSCREENER_BASE}/latest/dex/tokens/${addr}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        "DexScreener API Error:",
        response.status,
        response.statusText
      );
      return { error: `Failed to fetch DexScreener data: ${response.status}` };
    }

    // `tokens/v1` returns a bare array of pairs; `latest/dex/tokens` wraps them.
    const data: DexScreenerTokenProfile | DexScreenerPair[] =
      await response.json();
    const pairs: DexScreenerPair[] = Array.isArray(data)
      ? data
      : (data?.pairs ?? []);

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

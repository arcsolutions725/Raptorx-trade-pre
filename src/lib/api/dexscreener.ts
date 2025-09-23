/* eslint-disable @typescript-eslint/no-explicit-any */
const DEXSCREENER_BASE = "https://api.dexscreener.com";

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
  contractAddress: string
): Promise<DexScreenerPair | { error: string }> {
  try {
    if (!contractAddress) {
      return { error: "Contract address is required" };
    }

    // Fetch data from DexScreener
    const response = await fetch(
      `${DEXSCREENER_BASE}/latest/dex/tokens/${contractAddress}`
    );

    if (!response.ok) {
      console.error(
        "DexScreener API Error:",
        response.status,
        response.statusText
      );
      return { error: `Failed to fetch DexScreener data: ${response.status}` };
    }

    const data: DexScreenerTokenProfile = await response.json();

    // Check if any pairs exist
    if (!data || !data.pairs || data.pairs.length === 0) {
      return { error: "No DexScreener data found" };
    }

    // Sort pairs by 24h trading volume (highest first)
    const sortedPairs = [...data.pairs].sort(
      (a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0)
    );

    // Pick the highest volume pair
    const bestPair = sortedPairs[0];

    return bestPair;
  } catch (err: any) {
    console.error("DexScreener API Error:", err.message || err);
    return { error: "Failed to fetch DexScreener data" };
  }
}

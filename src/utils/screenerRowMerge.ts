import type { TrendingToken } from "@/hooks/useTrendingTokens";

/** Row has live market fields from Birdeye overview (not a registry stub). */
export function isRichScreenerRow(row?: TrendingToken | null): boolean {
  if (!row) return false;
  const price = row.usdPrice;
  const mc = row.marketCap;
  const liq = row.liquidityUsd;
  const vol = row.totalVolume?.["24h"];
  return (
    (typeof price === "number" && Number.isFinite(price) && price > 0) ||
    (typeof mc === "number" && Number.isFinite(mc) && mc > 0) ||
    (typeof liq === "number" && Number.isFinite(liq) && liq > 0) ||
    (typeof vol === "number" && Number.isFinite(vol) && vol > 0)
  );
}

function screenerRowKey(tokenAddress?: string): string | null {
  const addr = tokenAddress?.trim();
  if (!addr) return null;
  return addr.startsWith("0x") ? addr.toLowerCase() : addr;
}

/**
 * Prefer fresh rich rows; when a refetch returns a stub (rate limit / transient Birdeye miss),
 * keep the last known market metadata for that address.
 */
export function mergeRichScreenerRow(
  incoming: TrendingToken,
  previous?: TrendingToken,
): TrendingToken {
  if (!previous || !isRichScreenerRow(previous)) return incoming;
  if (isRichScreenerRow(incoming)) return incoming;

  return {
    ...previous,
    ...incoming,
    chainId: incoming.chainId ?? previous.chainId,
    tokenAddress: incoming.tokenAddress ?? previous.tokenAddress,
    name: incoming.name ?? previous.name,
    symbol: incoming.symbol ?? previous.symbol,
    logo: incoming.logo ?? previous.logo,
    decimals: incoming.decimals ?? previous.decimals,
    usdPrice: incoming.usdPrice ?? previous.usdPrice,
    marketCap: incoming.marketCap ?? previous.marketCap,
    liquidityUsd: incoming.liquidityUsd ?? previous.liquidityUsd,
    createdAt: incoming.createdAt ?? previous.createdAt,
    lastTradeUnixTime: incoming.lastTradeUnixTime ?? previous.lastTradeUnixTime,
    pricePercentChange:
      incoming.pricePercentChange?.["24h"] != null
        ? incoming.pricePercentChange
        : previous.pricePercentChange,
    volumePercentChange:
      incoming.volumePercentChange?.["24h"] != null
        ? incoming.volumePercentChange
        : previous.volumePercentChange,
    totalVolume:
      incoming.totalVolume?.["24h"] != null
        ? incoming.totalVolume
        : previous.totalVolume,
    _rank: incoming._rank ?? previous._rank,
  };
}

export function applyScreenerRowRichCache(
  incoming: TrendingToken[],
  cache: Map<string, TrendingToken>,
): TrendingToken[] {
  return incoming.map((row) => {
    const key = screenerRowKey(row.tokenAddress);
    if (!key) return row;
    const prev = cache.get(key);
    const merged = mergeRichScreenerRow(row, prev);
    cache.set(key, merged);
    return merged;
  });
}

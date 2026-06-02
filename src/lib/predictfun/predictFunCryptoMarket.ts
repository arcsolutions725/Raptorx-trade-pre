/* eslint-disable @typescript-eslint/no-explicit-any */

export type PredictFunCryptoVariantData = {
  type?: string;
  priceFeedId?: string | number | null;
  priceFeedProvider?: string | null;
  priceFeedSymbol?: string | null;
  startPrice?: number | null;
  endPrice?: number | null;
};

export type PredictFunCryptoMarketDataRow = {
  marketId?: string | number;
  priceFeedId?: string | number | null;
  priceFeedProvider?: string | null;
  priceFeedSymbol?: string | null;
  startPrice?: number | null;
  endPrice?: number | null;
};

export type PredictFunCryptoChartContext = {
  marketId: string;
  symbol: string;
  provider: string;
  priceFeedId: string | null;
  startPrice: number | null;
  startsAtMs: number | null;
  endsAtMs: number | null;
};

function readNumericId(value: unknown): string {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) ? s : "";
}

function firstObject(values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (value && typeof value === "object") return value as Record<string, unknown>;
  }
  return null;
}

function readVariantData(raw: Record<string, unknown> | null | undefined): PredictFunCryptoVariantData | null {
  if (!raw) return null;
  const variant = raw.variantData;
  if (!variant || typeof variant !== "object") return null;
  return variant as PredictFunCryptoVariantData;
}

function readMarketDataRows(raw: Record<string, unknown> | null | undefined): PredictFunCryptoMarketDataRow[] {
  if (!raw || !Array.isArray(raw.marketData)) return [];
  return raw.marketData.filter(
    (row): row is PredictFunCryptoMarketDataRow => row != null && typeof row === "object"
  );
}

function readNestedMarkets(raw: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  if (!raw) return [];
  const markets = raw.markets as unknown;
  if (Array.isArray(markets)) {
    return markets.filter((m): m is Record<string, unknown> => m != null && typeof m === "object");
  }
  const edges = (markets as { edges?: unknown })?.edges;
  if (Array.isArray(edges)) {
    return edges
      .map((e: any) => e?.node)
      .filter((m): m is Record<string, unknown> => m != null && typeof m === "object");
  }
  return [];
}

export function isPredictFunCryptoUpDownRaw(
  raw: Record<string, unknown> | null | undefined
): boolean {
  if (!raw) return false;
  const variant = String(raw.marketVariant ?? "").trim();
  if (variant === "CRYPTO_UP_DOWN") return true;
  const nested = readVariantData(raw);
  return nested?.type === "CRYPTO_UP_DOWN";
}

/** Resolve the numeric predict.fun market id used for orderbook/timeseries APIs. */
export function resolvePredictFunNumericMarketId(
  ...sources: Array<Record<string, unknown> | null | undefined>
): string {
  for (const raw of sources) {
    if (!raw) continue;
    const direct = readNumericId(raw.id);
    if (direct) return direct;
  }

  for (const raw of sources) {
    if (!raw) continue;
    for (const market of readNestedMarkets(raw)) {
      const id = readNumericId(market.id);
      if (id) return id;
    }
  }

  for (const raw of sources) {
    if (!raw) continue;
    for (const row of readMarketDataRows(raw)) {
      const id = readNumericId(row.marketId);
      if (id) return id;
    }
  }

  return "";
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function readStartPrice(
  marketRaw: Record<string, unknown> | null | undefined,
  categoryRaw: Record<string, unknown> | null | undefined
): number | null {
  const fromMarketVariant = readVariantData(marketRaw)?.startPrice;
  if (typeof fromMarketVariant === "number" && Number.isFinite(fromMarketVariant)) {
    return fromMarketVariant;
  }

  const fromCategoryVariant = readVariantData(categoryRaw)?.startPrice;
  if (typeof fromCategoryVariant === "number" && Number.isFinite(fromCategoryVariant)) {
    return fromCategoryVariant;
  }

  const rows = [
    ...readMarketDataRows(categoryRaw),
    ...readMarketDataRows(marketRaw),
  ];
  for (const row of rows) {
    if (typeof row.startPrice === "number" && Number.isFinite(row.startPrice)) {
      return row.startPrice;
    }
  }

  return null;
}

function readSymbol(
  marketRaw: Record<string, unknown> | null | undefined,
  categoryRaw: Record<string, unknown> | null | undefined
): string {
  const candidates = [
    readVariantData(marketRaw)?.priceFeedSymbol,
    readVariantData(categoryRaw)?.priceFeedSymbol,
    ...readMarketDataRows(categoryRaw).map((r) => r.priceFeedSymbol),
    ...readMarketDataRows(marketRaw).map((r) => r.priceFeedSymbol),
  ];
  for (const candidate of candidates) {
    const symbol = String(candidate ?? "").trim().toUpperCase();
    if (symbol) return symbol;
  }
  return "BTCUSDT";
}

function readProvider(
  marketRaw: Record<string, unknown> | null | undefined,
  categoryRaw: Record<string, unknown> | null | undefined
): string {
  const candidates = [
    readVariantData(marketRaw)?.priceFeedProvider,
    readVariantData(categoryRaw)?.priceFeedProvider,
    ...readMarketDataRows(categoryRaw).map((r) => r.priceFeedProvider),
    ...readMarketDataRows(marketRaw).map((r) => r.priceFeedProvider),
  ];
  for (const candidate of candidates) {
    const provider = String(candidate ?? "").trim().toUpperCase();
    if (provider) return provider;
  }
  return "BINANCE";
}

function readPriceFeedId(
  marketRaw: Record<string, unknown> | null | undefined,
  categoryRaw: Record<string, unknown> | null | undefined
): string | null {
  const candidates = [
    readVariantData(marketRaw)?.priceFeedId,
    readVariantData(categoryRaw)?.priceFeedId,
    ...readMarketDataRows(categoryRaw).map((r) => r.priceFeedId),
    ...readMarketDataRows(marketRaw).map((r) => r.priceFeedId),
  ];
  for (const candidate of candidates) {
    if (candidate == null || candidate === "") continue;
    return String(candidate);
  }
  return null;
}

export function buildPredictFunCryptoChartContext(
  marketRaw: Record<string, unknown> | null | undefined,
  categoryRaw: Record<string, unknown> | null | undefined
): PredictFunCryptoChartContext | null {
  const mergedCategory = firstObject([
    categoryRaw,
    (marketRaw?.parentCategory as Record<string, unknown> | undefined) ?? null,
  ]);
  const mergedMarket = firstObject([marketRaw, ...readNestedMarkets(categoryRaw)]);

  if (!isPredictFunCryptoUpDownRaw(mergedCategory) && !isPredictFunCryptoUpDownRaw(mergedMarket)) {
    return null;
  }

  const marketId = resolvePredictFunNumericMarketId(mergedMarket, mergedCategory, marketRaw, categoryRaw);
  if (!marketId) return null;

  const startsAtMs =
    parseIsoMs(mergedCategory?.startsAt) ??
    parseIsoMs(mergedMarket?.startsAt) ??
    parseIsoMs(mergedMarket?.boostStartsAt);
  const endsAtMs =
    parseIsoMs(mergedCategory?.endsAt) ??
    parseIsoMs(mergedMarket?.endsAt) ??
    parseIsoMs(mergedMarket?.boostEndsAt);

  return {
    marketId,
    symbol: readSymbol(mergedMarket, mergedCategory),
    provider: readProvider(mergedMarket, mergedCategory),
    priceFeedId: readPriceFeedId(mergedMarket, mergedCategory),
    startPrice: readStartPrice(mergedMarket, mergedCategory),
    startsAtMs,
    endsAtMs,
  };
}

export function formatPredictFunUsdPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPredictFunCompactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(value >= 10000 ? 1 : 2)}K`;
  }
  return formatPredictFunUsdPrice(value);
}

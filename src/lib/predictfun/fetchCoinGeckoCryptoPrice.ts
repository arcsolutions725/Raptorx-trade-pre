/** CoinGecko-only crypto price fetch for predict.fun up/down charts. */

export type CryptoPricePoint = { x: number; y: number };

export const ALLOWED_CRYPTO_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]);
export const ALLOWED_CRYPTO_INTERVALS = new Set(["1m", "5m", "15m"]);

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const COINGECKO_COIN_IDS: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  BNBUSDT: "binancecoin",
  SOLUSDT: "solana",
};

type CacheEntry<T> = { expiresAt: number; value: T };

const seriesCache = new Map<string, CacheEntry<CryptoPricePoint[]>>();
const latestCache = new Map<string, CacheEntry<number>>();

const SERIES_CACHE_MS = 120_000;
const LATEST_CACHE_MS = 15_000;

function readStaleSeries(cacheKey: string): CryptoPricePoint[] | null {
  const cached = seriesCache.get(cacheKey);
  return cached?.value.length ? cached.value : null;
}

function readStaleLatest(symbol: string): number | null {
  const cached = latestCache.get(symbol);
  return cached?.value ?? null;
}

function coingeckoHeaders(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY?.trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) headers["x-cg-pro-api-key"] = key;
  return headers;
}

function parsePricePoints(
  prices: [number, number][],
  startTimeMs: number,
  endTimeMs: number
): CryptoPricePoint[] {
  const startSec = Math.floor(startTimeMs / 1000);
  const endSec = Math.floor(endTimeMs / 1000);
  const seen = new Set<number>();
  const series: CryptoPricePoint[] = [];

  for (const [timeMs, price] of prices) {
    const x = Math.floor(timeMs / 1000);
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      x < startSec ||
      x > endSec ||
      seen.has(x)
    ) {
      continue;
    }
    seen.add(x);
    series.push({ x, y: price });
  }

  return series.sort((a, b) => a.x - b.x);
}

/**
 * CoinGecko `market_chart/range` returns very sparse data for short windows (e.g. 15m).
 * For sessions under 2 days, use `market_chart?days=1` (~5m granularity) and filter.
 */
async function fetchCoinGeckoSessionSeries(
  symbol: string,
  startTimeMs: number,
  endTimeMs: number
): Promise<CryptoPricePoint[]> {
  const coinId = COINGECKO_COIN_IDS[symbol];
  if (!coinId) throw new Error("Unsupported symbol");

  const windowMs = Math.max(0, endTimeMs - startTimeMs);

  if (windowMs <= 2 * 24 * 60 * 60 * 1000) {
    const days = windowMs <= 24 * 60 * 60 * 1000 ? "1" : "2";
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
      { cache: "no-store", headers: coingeckoHeaders() }
    );
    if (res.status === 429) throw new Error("CoinGecko rate limit exceeded");
    if (!res.ok) throw new Error(`CoinGecko market_chart error (${res.status})`);

    const json = (await res.json()) as { prices?: [number, number][] };
    const series = parsePricePoints(json.prices ?? [], startTimeMs, endTimeMs);
    if (series.length > 0) return series;
  }

  const fromSec = Math.floor(startTimeMs / 1000);
  const toSec = Math.floor(endTimeMs / 1000);
  const params = new URLSearchParams({
    vs_currency: "usd",
    from: String(fromSec),
    to: String(toSec),
  });

  const res = await fetch(
    `${COINGECKO_BASE}/coins/${coinId}/market_chart/range?${params.toString()}`,
    { cache: "no-store", headers: coingeckoHeaders() }
  );
  if (res.status === 429) throw new Error("CoinGecko rate limit exceeded");
  if (!res.ok) throw new Error(`CoinGecko API error (${res.status})`);

  const json = (await res.json()) as { prices?: [number, number][] };
  const series = parsePricePoints(json.prices ?? [], startTimeMs, endTimeMs);
  if (series.length === 0) {
    throw new Error("CoinGecko returned no price data for this session");
  }
  return series;
}

async function fetchCoinGeckoLatest(symbol: string): Promise<number> {
  const coinId = COINGECKO_COIN_IDS[symbol];
  if (!coinId) throw new Error("Unsupported symbol");

  const res = await fetch(
    `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd`,
    { cache: "no-store", headers: coingeckoHeaders() }
  );

  if (res.status === 429) throw new Error("CoinGecko rate limit exceeded");
  if (!res.ok) throw new Error(`CoinGecko API error (${res.status})`);

  const json = (await res.json()) as Record<string, { usd?: number }>;
  const price = json[coinId]?.usd;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error("CoinGecko returned invalid price");
  }
  return price;
}

export async function fetchCryptoKlinesSeries(opts: {
  symbol: string;
  interval: string;
  startTimeMs: number;
  endTimeMs: number;
}): Promise<CryptoPricePoint[]> {
  const symbol = opts.symbol.trim().toUpperCase();
  if (!ALLOWED_CRYPTO_SYMBOLS.has(symbol)) {
    throw new Error("Unsupported symbol");
  }
  const interval = opts.interval.trim();
  if (!ALLOWED_CRYPTO_INTERVALS.has(interval)) {
    throw new Error("Unsupported interval");
  }

  const cacheKey = `${symbol}|${interval}|${Math.floor(opts.startTimeMs / 60_000)}|${Math.floor(opts.endTimeMs / 60_000)}`;
  const cached = seriesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const series = await fetchCoinGeckoSessionSeries(
      symbol,
      opts.startTimeMs,
      opts.endTimeMs
    );
    seriesCache.set(cacheKey, { expiresAt: Date.now() + SERIES_CACHE_MS, value: series });
    return series;
  } catch (e) {
    const stale = readStaleSeries(cacheKey);
    if (stale) return stale;
    throw e;
  }
}

export async function fetchCryptoLatestPrice(symbol: string): Promise<number> {
  const normalized = symbol.trim().toUpperCase();
  if (!ALLOWED_CRYPTO_SYMBOLS.has(normalized)) {
    throw new Error("Unsupported symbol");
  }

  const cached = latestCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const price = await fetchCoinGeckoLatest(normalized);
    latestCache.set(normalized, { expiresAt: Date.now() + LATEST_CACHE_MS, value: price });
    return price;
  } catch (e) {
    const stale = readStaleLatest(normalized);
    if (stale != null) return stale;
    throw e;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

export interface TopCryptoToken {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  image?: string;
}

const CACHE_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

let cached: { tokens: TopCryptoToken[]; expiresAt: number } | null = null;

function coingeckoConfig(): { base: string; headers: Record<string, string> } {
  const proKey = process.env.COINGECKO_PRO_API_KEY?.trim();
  const key = (proKey || process.env.COINGECKO_API_KEY || "").trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (proKey) {
    headers["x-cg-pro-api-key"] = proKey;
    return { base: "https://pro-api.coingecko.com/api/v3", headers };
  }
  if (key) {
    headers["x-cg-demo-api-key"] = key;
    headers["x-cg-pro-api-key"] = key;
  }
  return { base: "https://api.coingecko.com/api/v3", headers };
}

function mapTokens(data: any[]): TopCryptoToken[] {
  return data.map((coin: any) => ({
    id: coin.id,
    symbol: String(coin.symbol || "").toUpperCase(),
    name: coin.name,
    current_price: coin.current_price || 0,
    price_change_percentage_24h: coin.price_change_percentage_24h || 0,
    market_cap: coin.market_cap || 0,
    image: coin.image,
  }));
}

async function fetchTopMarkets(): Promise<TopCryptoToken[]> {
  const { base, headers } = coingeckoConfig();
  const url = `${base}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=15&page=1&sparkline=false&price_change_percentage=24h`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.status === 429) {
        lastError = new Error("CoinGecko rate limited");
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("Unexpected CoinGecko response");
      }
      return mapTokens(data);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to fetch top cryptocurrencies");
}

export async function GET() {
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ tokens: cached.tokens }, { status: 200 });
  }

  try {
    const tokens = await fetchTopMarkets();
    cached = { tokens, expiresAt: Date.now() + CACHE_MS };
    return NextResponse.json({ tokens }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching top cryptocurrencies:", error);
    if (cached?.tokens?.length) {
      return NextResponse.json(
        { tokens: cached.tokens, stale: true },
        { status: 200 },
      );
    }
    return NextResponse.json({ tokens: [] }, { status: 200 });
  }
}

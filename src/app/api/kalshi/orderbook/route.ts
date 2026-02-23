/**
 * GET /api/kalshi/orderbook?market_ticker=...&depth=...
 *
 * Fetches the order book for a Kalshi market using the official Kalshi Trade API.
 * Auth: KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE (handled by kalshi-typescript SDK).
 * Required env: KALSHI_API_KEY, KALSHI_PRIVATE_KEY. Optional: KALSHI_BASE_PATH (default: api.elections.kalshi.com/trade-api/v2).
 * Docs: https://docs.kalshi.com/api-reference/market/get-market-orderbook
 * Auth guide: https://docs.kalshi.com/getting_started/quick_start_authenticated_requests
 */

import { Configuration, MarketsApi } from "kalshi-typescript";
import { NextRequest, NextResponse } from "next/server";
import type { OrderBookEntry } from "@/types/polymarketTrading";

function getKalshiConfig() {
  const apiKey = process.env.KALSHI_API_KEY;
  const privateKeyPem = process.env.KALSHI_PRIVATE_KEY;
  const basePath =
    process.env.KALSHI_BASE_PATH ||
    "https://api.elections.kalshi.com/trade-api/v2";

  if (!apiKey || !privateKeyPem) {
    throw new Error("Kalshi API credentials are not configured");
  }

  return new Configuration({
    apiKey,
    privateKeyPem,
    basePath,
  });
}

/** Raw level from API: [price_cents_or_dollars, count] - API returns yes/no bids only */
type RawLevel = [number | string, number | string];

function parseLevel(level: RawLevel): { price: number; size: number } {
  const priceRaw = level[0];
  const sizeRaw = level[1];
  const price =
    typeof priceRaw === "string" ? parseFloat(priceRaw) : Number(priceRaw);
  const size =
    typeof sizeRaw === "string" ? parseFloat(sizeRaw) : Number(sizeRaw);
  // If price looks like cents (0-100), convert to 0-1; otherwise assume already decimal
  const priceNorm = price > 1 ? price / 100 : price;
  return { price: priceNorm, size: isNaN(size) ? 0 : size };
}

function levelsToEntries(
  levels: RawLevel[],
  sortDesc: boolean
): OrderBookEntry[] {
  const parsed = levels
    .map(parseLevel)
    .filter((p) => p.size > 0 && !isNaN(p.price));
  const sorted = [...parsed].sort((a, b) =>
    sortDesc ? b.price - a.price : a.price - b.price
  );
  let total = 0;
  return sorted.map(({ price, size }) => {
    total += price * size;
    return { price, size, total };
  });
}

/** Derive asks from opposite side: no bid at P = yes ask at (1-P) */
function deriveAsksFromOppositeBids(
  oppositeBids: RawLevel[]
): OrderBookEntry[] {
  const asLevels: Array<[number, number]> = oppositeBids.map((level) => {
    const { price, size } = parseLevel(level);
    const priceNorm = price > 1 ? price / 100 : price;
    const askPrice = 1 - priceNorm;
    return [askPrice, size];
  });
  // Aggregate by price (sum size at same price)
  const byPrice = new Map<number, number>();
  for (const [p, s] of asLevels) {
    if (s <= 0 || isNaN(p)) continue;
    const key = Math.round(p * 10000) / 10000;
    byPrice.set(key, (byPrice.get(key) ?? 0) + s);
  }
  const aggregated = [...byPrice.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => a.price - b.price);
  let total = 0;
  return aggregated.map(({ price, size }) => {
    total += price * size;
    return { price, size, total };
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketTicker = searchParams.get("market_ticker");
    const depthParam = searchParams.get("depth");
    const depth =
      depthParam !== null && depthParam !== ""
        ? Math.min(100, Math.max(0, parseInt(depthParam, 10) || 0))
        : undefined;

    if (!marketTicker) {
      return NextResponse.json(
        { error: "market_ticker parameter is required" },
        { status: 400 }
      );
    }

    const config = getKalshiConfig();
    const marketsApi = new MarketsApi(config);

    const response = await marketsApi.getMarketOrderbook(marketTicker, depth);
    const data = response.data as {
      orderbook?: {
        yes?: RawLevel[];
        no?: RawLevel[];
        true?: RawLevel[];
        false?: RawLevel[];
        yes_dollars?: RawLevel[];
        no_dollars?: RawLevel[];
      };
      orderbook_fp?: {
        yes_dollars?: RawLevel[];
        no_dollars?: RawLevel[];
      };
    };

    const ob = data?.orderbook ?? {};
    const obFp = data?.orderbook_fp;
    // Prefer orderbook_fp (fixed-point) if present; otherwise legacy orderbook
    const yesLevels: RawLevel[] =
      obFp?.yes_dollars ??
      ob.yes_dollars ??
      ob.yes ??
      ob.true ??
      [];
    const noLevels: RawLevel[] =
      obFp?.no_dollars ?? ob.no_dollars ?? ob.no ?? ob.false ?? [];

    // Yes outcome: bids = yes bids (desc), asks = derived from no bids
    const yesBids = levelsToEntries(yesLevels, true);
    const yesAsks = deriveAsksFromOppositeBids(noLevels);

    // No outcome: bids = no bids (desc), asks = derived from yes bids
    const noBids = levelsToEntries(noLevels, true);
    const noAsks = deriveAsksFromOppositeBids(yesLevels);

    return NextResponse.json({
      yes: { bids: yesBids, asks: yesAsks },
      no: { bids: noBids, asks: noAsks },
      sequence: null,
    });
  } catch (error) {
    console.error("Kalshi orderbook API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch orderbook";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

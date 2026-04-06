/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/limitless/orderbook?slug=...
 * Proxies to Limitless API: GET https://api.limitless.exchange/api-v1/markets/{slug}/orderbook
 * Response: { bids: [{ price, size, side }], asks: [...], tokenId, adjustedMidpoint, midpoint, maxSpread, minSize, lastTradePrice }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug") || searchParams.get("market_slug");

    if (!slug) {
      return NextResponse.json(
        { error: "slug or market_slug is required" },
        { status: 400 }
      );
    }

    const url = `https://api.limitless.exchange/markets/${slug}/orderbook`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Limitless orderbook API error:", errorText);
      return NextResponse.json(
        { error: `Limitless orderbook API returned ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as any;
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
      },
    });
  } catch (error) {
    console.error("Limitless orderbook error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch orderbook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

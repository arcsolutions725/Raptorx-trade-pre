/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug") || searchParams.get("id") || searchParams.get("ticker");
    
    if (!slug) {
      return NextResponse.json(
        { error: "Slug, id, or ticker parameter is required" },
        { status: 400 }
      );
    }

    // Build URL for Limitless API
    // Using /markets/{slug} endpoint
    const baseUrl = `https://api.limitless.exchange/markets/${slug}`;
    const response = await fetch(baseUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Limitless API error response:", errorText);
      throw new Error(`Limitless API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Venue and position IDs required for trading (EIP-712 and order submission)
    // API returns venue: { exchange, adapter } and tokens: { yes, no } (not positionIds array)
    const venue = data.venue?.exchange
      ? { exchange: data.venue.exchange, adapter: data.venue.adapter ?? undefined }
      : null;
    const positionIds =
      data.tokens?.yes != null && data.tokens?.no != null
        ? [String(data.tokens.yes), String(data.tokens.no)]
        : Array.isArray(data.positionIds)
          ? data.positionIds.map(String)
          : null;

    // Transform the response to match expected format
    // Based on actual API structure: { id, logo, slug, tags, title, venue, prices, status, tokens }
    const prices = data.prices || [];
    const yesPrice = prices[0] !== undefined ? parseFloat(String(prices[0])) * 100 : "—";
    const noPrice = prices[1] !== undefined ? parseFloat(String(prices[1])) * 100 : "—";

    const status = data.status || "";
    const active = status === "FUNDED" || status === "ACTIVE";
    const closed = status === "CLOSED" || status === "RESOLVED";
    const archived = status === "ARCHIVED";

    // categoryId used for chart interval options (Crypto/Finance: 1H, ALL; Other: 1H, 6H, 1D, 1W, 1M, ALL)
    const categoryId = data.marketPageId ?? data.categoryId ?? data.category ?? null;

    // Condition ID (bytes32) for CTF redeemPositions after market resolves (Limitless team: USDC, parent 0x0, indexSets [1,2])
    const conditionId =
      data.conditionId ?? data.condition_id ?? data.condition ?? null;

    const marketDetails = {
      id: String(data.id || slug),
      ticker: data.slug || String(data.id || slug),
      slug: data.slug || String(data.id || slug),
      title: data.title || "",
      subtitle: data.tags?.[0] || "",
      description: "",
      image: data.logo || null,
      icon: data.logo || null,
      active,
      closed,
      archived,
      volume: 0,
      volume24hr: 0,
      liquidity: 0,
      yesPrice,
      noPrice,
      markets: [],
      tags: data.tags || [],
      symbol_image_url: data.logo || null,
      rawEventData: data,
      venue,
      positionIds,
      categoryId: categoryId != null ? String(categoryId) : null,
      conditionId: conditionId != null ? String(conditionId) : null,
    };

    return NextResponse.json(marketDetails, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Limitless API error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch market details";
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

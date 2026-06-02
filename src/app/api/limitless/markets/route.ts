/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { sortLimitlessMarketsByVolumeDesc } from "@/lib/limitless/sortMarketsByVolume";

// Transform Limitless API response to market format
// Based on actual API response: { id, logo, slug, tags, title, prices, status, volume, volumeFormatted }
function transformLimitlessMarket(market: any): any {
  // Prices are in 0-1 format, convert to cents (0-100)
  const prices = market.prices || [];
  const yesPrice = prices[0] !== undefined ? parseFloat(String(prices[0])) * 100 : "—";
  const noPrice = prices[1] !== undefined ? parseFloat(String(prices[1])) * 100 : "—";

  // Determine status
  const status = market.status || "";
  const active = status === "FUNDED" || status === "ACTIVE";
  const closed = status === "CLOSED" || status === "RESOLVED";
  const archived = status === "ARCHIVED";

  // Volume: use volumeFormatted for display; parse volume for numeric when available
  let volumeNum = 0;
  const volumeFormattedRaw = market.volumeFormatted != null && market.volumeFormatted !== ""
    ? String(market.volumeFormatted).trim()
    : "";
  if (volumeFormattedRaw) {
    const v = parseFloat(volumeFormattedRaw);
    if (Number.isFinite(v)) volumeNum = v;
  } else if (market.volume != null) {
    const v = typeof market.volume === "string" ? parseFloat(market.volume) : Number(market.volume);
    if (Number.isFinite(v)) volumeNum = v;
  }

  return {
    id: String(market.id || market.slug || ""),
    ticker: market.slug || String(market.id || ""),
    slug: market.slug || String(market.id || ""),
    title: market.title || "",
    subtitle: market.tags?.[0] || "",
    description: "",
    image: market.logo || market.imageUrl || null,
    icon: market.logo || market.imageUrl || null,
    active,
    closed,
    archived,
    volume: volumeNum,
    volume24hr: volumeNum,
    volumeFormatted: volumeFormattedRaw || undefined,
    liquidity: 0,
    yesPrice,
    noPrice,
    choiceI: yesPrice,
    choiceII: noPrice,
    markets: [],
    tags: market.tags || [],
    rawEventData: market,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const searchQuery =
      searchParams.get("q") ||
      searchParams.get("search") ||
      searchParams.get("query") ||
      undefined;
    const trimmedQuery = searchQuery?.trim() ?? "";

    /**
     * Text search: GET /markets/search — required `query`, optional `limit`, `page`, `similarityThreshold`.
     * Browse: GET /markets/active — do not send `q` here (returns 400).
     * @see https://api.limitless.exchange/api-v1 (Markets → GET /markets/search)
     */
    const baseUrl = trimmedQuery
      ? "https://api.limitless.exchange/markets/search"
      : "https://api.limitless.exchange/markets/active";

    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (trimmedQuery) {
      params.set("query", trimmedQuery);
      const sim = searchParams.get("similarityThreshold");
      if (sim != null && sim.trim() !== "") {
        params.set("similarityThreshold", sim.trim());
      }
    }

    const url = `${baseUrl}?${params.toString()}`;
    const response = await fetch(url, {
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

    // /markets/active: { data: [...], totalMarketsCount }
    // /markets/search: { markets: [...], totalMarketsCount }
    let marketsArray: any[] = [];
    if (Array.isArray(data.markets)) {
      marketsArray = data.markets;
    } else if (data.data && Array.isArray(data.data)) {
      marketsArray = data.data;
    } else if (Array.isArray(data)) {
      marketsArray = data;
    }

    const markets = sortLimitlessMarketsByVolumeDesc(
      marketsArray.map(transformLimitlessMarket).filter((m: any) => m !== null),
    );

    const totalCount =
      typeof data.totalMarketsCount === "number"
        ? data.totalMarketsCount
        : data.total || data.count || data.totalCount || markets.length;

    const hasMore =
      markets.length === limit && page * limit < totalCount;

    return NextResponse.json({
      markets,
      count: totalCount,
      hasMore: hasMore,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Limitless API error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch markets";
    
    return NextResponse.json(
      { error: errorMessage, markets: [], count: 0 },
      { status: 500 }
    );
  }
}

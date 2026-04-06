/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

// Transform Kalshi API series response to KalashiMarket format
function transformSeriesToMarket(series: any): any {
  // Find the most active market (one with non-zero bid/ask or highest score)
  // If no active market with bid/ask, use the first market with the highest score (least negative)
  let activeMarket = series.markets?.find((m: any) => 
    (m.yes_bid > 0 || m.yes_ask > 0) && m.score > -10000000000
  );
  
  // If no active market found, try to find one with any activity
  if (!activeMarket && series.markets?.length > 0) {
    // Sort by score (highest first) and take the first one
    const sortedMarkets = [...series.markets].sort((a: any, b: any) => (b.score || -Infinity) - (a.score || -Infinity));
    activeMarket = sortedMarkets[0];
  }
  
  // If still no market, use the first one
  if (!activeMarket && series.markets?.length > 0) {
    activeMarket = series.markets[0];
  }

  if (!activeMarket) {
    return null;
  }

  // Convert price from cents (0-100) to decimal (0-1)
  const convertPrice = (price: number) => price / 100;

  // Transform all markets in the series for multi-choice events
  const allMarkets = (series.markets || []).map((m: any) => ({
    ticker: m.ticker,
    yes_subtitle: m.yes_subtitle || "",
    no_subtitle: m.no_subtitle || "",
    yes_bid: m.yes_bid || 0,
    yes_ask: m.yes_ask || 0,
    last_price: m.last_price || 0,
    yes_bid_dollars: m.yes_bid_dollars ? Number(m.yes_bid_dollars) : convertPrice(m.yes_bid || 0),
    yes_ask_dollars: m.yes_ask_dollars ? Number(m.yes_ask_dollars) : convertPrice(m.yes_ask || 0),
    last_price_dollars: m.last_price_dollars ? Number(m.last_price_dollars) : convertPrice(m.last_price || 0),
    volume: m.volume || 0,
    volume_24h: m.volume_24h || m.volume || 0,
    score: m.score || 0,
    custom_strike: m.custom_strike,
  }));

  return {
    ticker: activeMarket.ticker || series.event_ticker || series.series_ticker,
    event_ticker: series.event_ticker,
    market_type: "binary",
    title: series.event_title || series.series_title || "",
    subtitle: series.event_subtitle || activeMarket.yes_subtitle || "",
    open_time: activeMarket.open_ts || "",
    close_time: activeMarket.close_ts || "",
    expected_expiration_time: activeMarket.expected_expiration_ts || activeMarket.close_ts || "",
    latest_expiration_time: activeMarket.expected_expiration_ts,
    status: activeMarket.result || "open",
    result: activeMarket.result || "",
    volume: series.total_volume || 0,
    volume_24h: series.total_volume || 0,
    // Liquidity is not available in the markets list API response
    // It's only available when fetching market details via /trade-api/v2/events/{event_ticker}
    // Set to undefined so the table shows "—" instead of a misleading value
    liquidity: activeMarket.liquidity !== undefined ? Number(activeMarket.liquidity) : undefined,
    open_interest: series.total_market_count || 0,
    strike_type: activeMarket.custom_strike ? "custom" : undefined,
    yes_ask: convertPrice(activeMarket.yes_ask || 0),
    yes_bid: convertPrice(activeMarket.yes_bid || 0),
    // Use no_ask from API if available, otherwise calculate as 100 - yes_bid
    no_ask: activeMarket.no_ask !== undefined 
      ? convertPrice(activeMarket.no_ask) 
      : (activeMarket.yes_bid !== undefined ? convertPrice(100 - activeMarket.yes_bid) : undefined),
    // Use no_bid from API if available, otherwise calculate as 100 - yes_ask
    no_bid: activeMarket.no_bid !== undefined 
      ? convertPrice(activeMarket.no_bid) 
      : (activeMarket.yes_ask !== undefined ? convertPrice(100 - activeMarket.yes_ask) : undefined),
    yes_price: convertPrice(activeMarket.last_price || activeMarket.yes_bid || 0),
    no_price: activeMarket.last_price !== undefined ? convertPrice(100 - activeMarket.last_price) : undefined,
    underlying: series.product_metadata?.subcategories?.Crypto?.[0] || "",
    category: series.category || "",
    ranged_group_name: series.series_title,
    series_ticker: series.series_ticker,
    // Include all markets array for multi-choice events
    markets: allMarkets,
    // Include full market data for report generation
    rawMarketData: activeMarket,
    rawSeriesData: series,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const pageSize = parseInt(searchParams.get("limit") || "25");
    const status = searchParams.get("status") || "open";
    const cursor = searchParams.get("cursor") || undefined;
    const category = searchParams.get("category") || undefined;
    const tag = searchParams.get("tag") || undefined;
    const query = searchParams.get("query") || undefined;

    // Build URL for Kalshi demo API
    const baseUrl = "https://api.elections.kalshi.com/v1/search/series";
    const params = new URLSearchParams({
      order_by: query ? "querymatch" : "trending", // Use querymatch for search, trending for category browse
      status: status,
      page_size: pageSize.toString(),
      with_milestones: "true",
    });

    // Add search query if provided
    if (query) {
      params.append("query", query);
      params.append("fuzzy_threshold", "4"); // Add fuzzy threshold for search
    }

    // Only add category filter if not searching (search overrides category)
    if (category && category !== "all" && !query) {
      // Map category names to API format
      // Note: API uses exact names like "Financials", "Climate and Weather", etc.
      const categoryMap: Record<string, string> = {
        crypto: "Crypto",
        politics: "Politics",
        sports: "Sports",
        finance: "Financials", // API uses "Financials" not "Finance"
        financials: "Financials",
        economics: "Economics",
        climate: "Climate",
        "climate and weather": "Climate and Weather",
        "Climate and Weather": "Climate and Weather", // Handle exact case
        entertainment: "Entertainment",
        companies: "Companies",
        health: "Health",
        "science and technology": "Science and Technology",
        "Science and Technology": "Science and Technology", // Handle exact case
        transportation: "Transportation",
        world: "World",
      };
      
      // Try exact match first, then case-insensitive, then mapped, then capitalize first letter
      let mappedCategory = categoryMap[category]; // Try exact match first
      
      if (!mappedCategory) {
        const lowerCategory = category.toLowerCase();
        mappedCategory = categoryMap[lowerCategory] || 
                        categoryMap[category] || 
                        category.charAt(0).toUpperCase() + category.slice(1);
      }
      
      params.append("category", mappedCategory);
    }

    if (tag) {
      params.append("tag", tag);
    }

    if (cursor) {
      params.append("cursor", cursor);
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
      console.error("Kalshi API error response:", errorText);
      throw new Error(`Kalshi API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Transform the response
    const seriesList = data.current_page || [];
    
    const markets = seriesList
      .map(transformSeriesToMarket)
      .filter((m: any) => m !== null); // Filter out null entries
    

    // Return in the expected format
    return NextResponse.json({
      markets,
      count: data.total_results_count || markets.length,
      cursor: data.next_cursor || undefined,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Kalshi API error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch markets";
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

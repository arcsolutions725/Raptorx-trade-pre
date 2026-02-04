/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const limit = parseInt(searchParams.get("limit") || "25");
    const offset = parseInt(searchParams.get("offset") || "0");
    const active = searchParams.get("active") || "true";
    const archived = searchParams.get("archived") || "false";
    const closed = searchParams.get("closed") || "false";
    const tagSlug = searchParams.get("tag_slug") || undefined;
    const searchQuery = searchParams.get("q") || searchParams.get("search") || undefined;
    const order = searchParams.get("order") || "volume24hr";
    const ascending = searchParams.get("ascending") || "false";

    let data: any;
    let events: any[] = [];
    let hasMore = false;
    let totalCount = 0;

    // If search query is provided, use the public-search endpoint
    if (searchQuery && searchQuery.trim()) {
      const baseUrl = "https://gamma-api.polymarket.com/public-search";
      const params = new URLSearchParams({
        q: searchQuery.trim(),
      });

      const url = `${baseUrl}?${params.toString()}`;
      console.log("Fetching Polymarket markets from search:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Polymarket search API error response:", errorText);
        throw new Error(`Polymarket search API returned ${response.status}: ${errorText}`);
      }

      data = await response.json();
      
      // The public-search endpoint returns { events: [...], pagination: {...} }
      events = data.events || [];
      hasMore = data.pagination?.hasMore || false;
      totalCount = data.pagination?.totalResults || events.length;
    } else {
      // Build URL for Polymarket events endpoint (according to official docs)
      // https://docs.polymarket.com/api-reference/events/list-events
      const baseUrl = "https://gamma-api.polymarket.com/events";
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        active: active,
        archived: archived,
        closed: closed,
        order: order,
        ascending: ascending,
      });

      if (tagSlug) {
        params.append("tag_slug", tagSlug);
      }

      const url = `${baseUrl}?${params.toString()}`;
      console.log("Fetching Polymarket markets from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Polymarket API error response:", errorText);
        throw new Error(`Polymarket API returned ${response.status}: ${errorText}`);
      }

      // According to the docs, the /events endpoint returns an array directly
      const eventsArray = await response.json();
      
      // The response is an array of events, not an object
      events = Array.isArray(eventsArray) ? eventsArray : [];
      
      // Determine hasMore: if we got exactly the limit, there might be more
      // Request one more item to check if there's more data
      hasMore = events.length === limit;
      
      // For totalCount, we don't have it from the API, so we'll use undefined
      // The frontend will handle pagination based on hasMore
      totalCount = 0; // Unknown total count
    }
    
    const markets = events.map((event: any) => {
      const marketsArray = event.markets || [];
      const marketsLength = marketsArray.length;
      
      // Determine Yes/No prices and Choice I/II based on market count
      let yesPrice: string | number = "—";
      let noPrice: string | number = "—";
      let choiceI: string | number = "—";
      let choiceII: string | number = "—";

      if (marketsLength >= 2) {
        // Show - for Yes/No, show first two markets' lastTradePrice*100 for Choice I/II
        const firstMarket = marketsArray[0];
        const secondMarket = marketsArray[1];
        
        if (firstMarket?.lastTradePrice !== undefined && firstMarket?.lastTradePrice !== null) {
          choiceI = (parseFloat(String(firstMarket.lastTradePrice)) * 100).toFixed(2);
        }
        if (secondMarket?.lastTradePrice !== undefined && secondMarket?.lastTradePrice !== null) {
          choiceII = (parseFloat(String(secondMarket.lastTradePrice)) * 100).toFixed(2);
        }
      } else if (marketsLength < 2 && marketsLength > 0) {
        // Show outcomePrices for Yes/No, show - for Choice I/II
        const market = marketsArray[0];
        if (market?.outcomePrices) {
          try {
            let outcomePrices;
            if (typeof market.outcomePrices === "string") {
              outcomePrices = JSON.parse(market.outcomePrices);
            } else {
              outcomePrices = market.outcomePrices;
            }
            if (Array.isArray(outcomePrices) && outcomePrices.length >= 2) {
              yesPrice = (parseFloat(String(outcomePrices[0])) * 100).toFixed(2);
              noPrice = (parseFloat(String(outcomePrices[1])) * 100).toFixed(2);
            }
          } catch (e) {
            console.warn("Failed to parse outcomePrices:", e);
          }
        }
      }

      return {
        id: event.id,
        ticker: event.ticker || event.slug,
        slug: event.slug,
        title: event.title,
        subtitle: event.subtitle,
        description: event.description,
        image: event.image,
        icon: event.icon,
        active: event.active,
        closed: event.closed,
        archived: event.archived,
        volume: event.volume || 0,
        volume24hr: event.volume24hr || 0,
        liquidity: event.liquidity || 0,
        markets: marketsArray,
        yesPrice,
        noPrice,
        choiceI,
        choiceII,
        // Store raw event data for reference
        rawEventData: event,
      };
    });

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
    console.error("Polymarket API error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch markets";
    
    return NextResponse.json(
      { error: errorMessage, markets: [], count: 0 },
      { status: 500 }
    );
  }
}

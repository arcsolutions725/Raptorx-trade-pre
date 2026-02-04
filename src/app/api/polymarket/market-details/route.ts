/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("event_id");
    const eventTicker = searchParams.get("event_ticker");
    const slug = searchParams.get("slug");

    if (!eventId && !eventTicker && !slug) {
      return NextResponse.json(
        { error: "event_id, event_ticker, or slug parameter is required" },
        { status: 400 }
      );
    }

    let event: any = null;

    // If slug is provided, use the slug endpoint (preferred method)
    if (slug) {
      const url = `https://gamma-api.polymarket.com/events/slug/${slug}`;
      console.log("Fetching Polymarket event by slug:", url);

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

      event = await response.json();
    } else if (eventId) {
      // If event_id is provided, use the direct endpoint (faster)
      const url = `https://gamma-api.polymarket.com/events/${eventId}`;
      console.log("Fetching Polymarket event by ID:", url);

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

      event = await response.json();
    } else {
      // Fall back to searching by ticker/slug through pagination
      const baseUrl = "https://gamma-api.polymarket.com/events/pagination";
      let foundEvent: any = null;
      let offset = 0;
      const limit = 100; // Search in batches of 100
      const maxPages = 10; // Limit search to 10 pages (1000 events max)

      for (let page = 0; page < maxPages; page++) {
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
          active: "true",
          archived: "false",
          closed: "false",
        });

        const url = `${baseUrl}?${params.toString()}`;
        console.log(`Fetching Polymarket event details (page ${page + 1}):`, url);

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

        const data = await response.json();
        const events = data.data || [];
        
        // Find the event with matching ticker or slug
        foundEvent = events.find((e: any) => 
          e.ticker === eventTicker || 
          e.slug === eventTicker ||
          e.id === eventTicker
        );
        
        if (foundEvent) {
          break; // Found it!
        }

        // Check if there are more pages
        if (!data.hasMore || events.length < limit) {
          break; // No more pages
        }

        offset += limit;
      }
      
      if (!foundEvent) {
        // If not found via pagination, try slug endpoint as fallback
        try {
          const slugUrl = `https://gamma-api.polymarket.com/events/slug/${eventTicker}`;
          console.log("Trying Polymarket event by slug as fallback:", slugUrl);
          
          const slugResponse = await fetch(slugUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
          });

          if (slugResponse.ok) {
            event = await slugResponse.json();
          } else {
            return NextResponse.json(
              { error: `Event with ticker/slug ${eventTicker} not found` },
              { status: 404 }
            );
          }
        } catch (slugError) {
          return NextResponse.json(
            { error: `Event with ticker/slug ${eventTicker} not found` },
            { status: 404 }
          );
        }
      } else {
        event = foundEvent;
      }
    }

    // Transform Polymarket event data to match MarketDetails type
    const marketsArray = event.markets || [];
    
    // Transform markets to MarketOutcome format
    const transformedMarkets = marketsArray.map((market: any) => {
      // Parse outcomes and outcomePrices
      let outcomes: string[] = [];
      let outcomePrices: string[] = [];
      
      try {
        if (typeof market.outcomes === "string") {
          outcomes = JSON.parse(market.outcomes);
        } else if (Array.isArray(market.outcomes)) {
          outcomes = market.outcomes;
        }
      } catch (e) {
        console.warn("Failed to parse outcomes:", e);
      }

      try {
        if (typeof market.outcomePrices === "string") {
          outcomePrices = JSON.parse(market.outcomePrices);
        } else if (Array.isArray(market.outcomePrices)) {
          outcomePrices = market.outcomePrices;
        }
      } catch (e) {
        console.warn("Failed to parse outcomePrices:", e);
      }

      // Get bid/ask prices
      const bestBid = market.bestBid || 0;
      const bestAsk = market.bestAsk || 0;

      // Use outcomePrices directly as primary source (matches Polymarket market data exactly)
      // outcomePrices[0] = Yes price, outcomePrices[1] = No price
      let yesPrice: number;
      let noPrice: number;
      
      if (outcomePrices.length >= 2) {
        // Use outcomePrices directly - this matches the market data exactly
        const parsedYes = parseFloat(outcomePrices[0]);
        const parsedNo = parseFloat(outcomePrices[1]);
        // Validate parsed values are valid numbers
        if (!isNaN(parsedYes) && !isNaN(parsedNo) && parsedYes >= 0 && parsedNo >= 0) {
          yesPrice = parsedYes;
          noPrice = parsedNo;
        } else if (!isNaN(parsedYes) && parsedYes >= 0 && parsedYes <= 1) {
          // If Yes price is valid but No price is not, calculate it
          yesPrice = parsedYes;
          noPrice = 1 - yesPrice;
        } else if (bestBid > 0 && bestAsk > 0) {
          // Fall back to mid-price if outcomePrices invalid
          yesPrice = (bestBid + bestAsk) / 2;
          noPrice = 1 - yesPrice;
        } else {
          // Last resort: use lastTradePrice
          yesPrice = market.lastTradePrice || 0;
          noPrice = 1 - yesPrice;
        }
      } else if (outcomePrices.length === 1) {
        // Only Yes price available, calculate No price
        const parsedYes = parseFloat(outcomePrices[0]);
        if (!isNaN(parsedYes) && parsedYes >= 0 && parsedYes <= 1) {
          yesPrice = parsedYes;
          noPrice = 1 - yesPrice;
        } else if (bestBid > 0 && bestAsk > 0) {
          yesPrice = (bestBid + bestAsk) / 2;
          noPrice = 1 - yesPrice;
        } else {
          yesPrice = market.lastTradePrice || 0;
          noPrice = 1 - yesPrice;
        }
      } else if (bestBid > 0 && bestAsk > 0) {
        // Fall back to mid-price if outcomePrices not available
        yesPrice = (bestBid + bestAsk) / 2;
        noPrice = 1 - yesPrice;
      } else {
        // Last resort: use lastTradePrice
        yesPrice = market.lastTradePrice || 0;
        noPrice = 1 - yesPrice;
      }

      // Calculate volume
      const volume = market.volumeNum || parseFloat(market.volume || "0");
      const volume24hr = market.volume24hr || parseFloat(market.volume24hr || "0");

      // Get liquidity
      const liquidity = market.liquidityNum || parseFloat(market.liquidity || "0");

      // Extract condition ID - this is the token ID needed for CLOB API
      // Polymarket markets have conditionId field which is the token ID for Yes outcome
      // For binary markets, we need the Yes token condition ID
      const conditionId = market.conditionId || market.condition_id || market.id || "";
      
      // Extract CLOB token IDs - each market has two tokens (Yes and No)
      // The first token ID is for "Yes" outcome, which is used for price history
      // The second token ID is for "No" outcome
      let clobTokenId: string | undefined = undefined;
      let clobNoTokenId: string | undefined = undefined;
      if (market.clobTokenIds) {
        try {
          // clobTokenIds is a JSON string array: "[\"token1\", \"token2\"]"
          const clobTokenIds = typeof market.clobTokenIds === "string" 
            ? JSON.parse(market.clobTokenIds) 
            : market.clobTokenIds;
          
          if (Array.isArray(clobTokenIds) && clobTokenIds.length > 0) {
            // Use the first CLOB token ID (Yes token) for price history
            clobTokenId = clobTokenIds[0];
            // Use the second CLOB token ID (No token) if available
            if (clobTokenIds.length > 1) {
              clobNoTokenId = clobTokenIds[1];
            }
          }
        } catch (e) {
          console.warn("Failed to parse clobTokenIds:", e);
        }
      }
      
      // Extract market ID - this is needed for the holders API endpoint
      // The market ID is typically the market's id field (different from condition ID)
      const marketId = market.id || market.marketId || market.market_id || conditionId;
      
      return {
        ticker: conditionId, // Use condition ID as ticker for CLOB API calls
        condition_id: conditionId, // Also include as separate field for clarity
        clob_token_id: clobTokenId, // First CLOB token ID (Yes token) for prices-history API
        clob_no_token_id: clobNoTokenId, // Second CLOB token ID (No token) for trading
        market_id: marketId, // Market ID for holders API
        subtitle: market.question || market.groupItemTitle || outcomes[0] || "Outcome",
        groupItemTitle: market.groupItemTitle || market.question || outcomes[0] || "Outcome",
        probability: yesPrice,
        yes_price: yesPrice,
        no_price: noPrice,
        volume: volume,
        volume_24h: volume24hr,
        yes_bid: bestBid,
        yes_ask: bestAsk,
        liquidity: liquidity,
        open_interest: parseFloat(market.openInterest || "0"),
        status: market.closed ? "closed" : market.active ? "open" : "unopened",
        result: market.resolvedBy ? "resolved" : undefined,
        open_time: market.startDate || market.startDateIso || null,
        close_time: market.endDate || market.endDateIso || null,
        expected_expiration_time: market.endDate || market.endDateIso || null,
      };
    });

    // Calculate total volume
    const totalVolume = transformedMarkets.reduce((sum: number, m: any) => sum + (m.volume || 0), 0);
    const totalSeriesVolume = event.volume || totalVolume;

    // Get image URL
    const symbolImageUrl = event.image || event.icon || "";

    // Get series ID from event (for comments API)
    const seriesId = event.series && event.series.length > 0 
      ? event.series[0].id 
      : null;

    // Return structured data matching MarketDetails type
    return NextResponse.json({
      series_ticker: event.ticker || eventTicker || event.id,
      title: event.title || "",
      subtitle: event.description || "",
      category: event.tags?.[0]?.slug || "",
      markets: transformedMarkets,
      total_volume: totalVolume,
      total_series_volume: totalSeriesVolume,
      symbol_image_url: symbolImageUrl,
      open_time: event.startDate || null,
      close_time: event.endDate || null,
      expected_expiration_time: event.endDate || null,
      // Additional fields for external links
      ticker: event.ticker || eventTicker || event.id,
      slug: event.slug || null, // Include slug for navigation
      // Include event ID and series ID for comments API
      event_id: event.id ? String(event.id) : eventId || null,
      series_id: seriesId ? String(seriesId) : null,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err: any) {
    console.error("Polymarket market details error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch Polymarket market details", details: msg },
      { status: 500 }
    );
  }
}


/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventTicker = searchParams.get("event_ticker");

    if (!eventTicker) {
      return NextResponse.json(
        { error: "event_ticker parameter is required" },
        { status: 400 }
      );
    }

    // Use the trade-api v2 events endpoint as per Kalshi API documentation
    // https://api.elections.kalshi.com/trade-api/v2/events/{event_ticker}
    const eventsUrl = `https://api.elections.kalshi.com/trade-api/v2/events/${eventTicker}`;

    // Fetch event metadata to get image_url
    const metadataUrl = `https://api.elections.kalshi.com/trade-api/v2/events/${eventTicker}/metadata`;

    // Fetch both event data and metadata in parallel
    const [eventsResponse, metadataResponse] = await Promise.all([
      fetch(eventsUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }),
      fetch(metadataUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }).catch((err) => {
        // If metadata fetch fails, log but don't throw - we'll use fallback
        console.warn("Failed to fetch event metadata:", err);
        return null;
      }),
    ]);

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text();
      console.error("Kalshi API error response:", errorText);
      throw new Error(`Kalshi API returned ${eventsResponse.status}: ${errorText}`);
    }

    const eventsData = await eventsResponse.json();
    
    // Extract image_url from metadata if available
    let imageUrl: string | undefined;
    if (metadataResponse && metadataResponse.ok) {
      try {
        const metadataData = await metadataResponse.json();
        imageUrl = metadataData.image_url;
      } catch (err) {
        console.warn("Failed to parse metadata response:", err);
      }
    }

    return await processEventsData(eventsData, eventTicker, imageUrl);
  } catch (error) {
    console.error("Kalshi market details API error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch market details";
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

async function processEventsData(data: any, eventTicker: string, metadataImageUrl?: string) {
  // Extract event and markets from the response; show only active markets (exclude finalized, etc.)
  const event = data.event || {};
  const allMarkets: any[] = Array.isArray(data.markets) ? data.markets : [];
  const markets: any[] = allMarkets.filter((m: any) => (m.status || "").toLowerCase() === "active");


  // Transform each market to include all necessary fields
  const transformedMarkets = markets.map((market: any, index: number) => {
    // Trade-api v2 events endpoint returns prices in cents (0-100 range)
    // Use last_price_dollars if available (already in decimal 0-1), otherwise convert from cents
    // Note: last_price_dollars might be a string, so convert to number
    const lastPriceCents = Number(market.last_price) || 0;
    const lastPriceDollarsStr = market.last_price_dollars;
    const lastPriceDollars = lastPriceDollarsStr ? Number(lastPriceDollarsStr) : (lastPriceCents / 100);
    
    // Yes price: use last_price_dollars if available, otherwise convert from cents
    // Ensure it's always a number
    const yesPrice = Number(lastPriceDollars) || 0;
    
    // No price: inverse of yes price
    const noPrice = yesPrice > 0 ? Number((1 - yesPrice).toFixed(4)) : 0;
    
    // Probability is the yes_price (chance percent value) - they represent the same thing
    const probability = yesPrice;
    
    // Bid/Ask values are in cents (0-100 range) from the API - ensure they're numbers
    const yesBid = Number(market.yes_bid) || 0;
    const yesAsk = Number(market.yes_ask) || 0;
    
    // Extract candidate name from custom_strike if available
    const candidateName = market.custom_strike?.Candidate || 
                         market.custom_strike?.candidate ||
                         market.subtitle || 
                         market.yes_sub_title || 
                         market.no_sub_title || 
                         market.title || 
                         `Outcome ${index + 1}`;
    
    // Try to get market_id from various possible fields
    // Kalshi API might use different field names, so check multiple options
    const marketId = market.market_id || 
                     market.id || 
                     market.market_ticker || 
                     market.ticker || 
                     null;
    
    
    return {
      ticker: market.ticker || `market-${index}`,
      market_id: marketId, // Include market ID for price history API
      subtitle: candidateName,
      probability: probability,
      // Prices in dollars (0-1 range) for display
      yes_price: yesPrice,
      no_price: noPrice,
      // Volume in number of contracts - ensure it's a number
      volume: Number(market.volume) || 0,
      // Volume 24h - from trade-api v2 - ensure it's a number
      volume_24h: Number(market.volume_24h) || Number(market.volume) || 0,
      // Bid/Ask in cents (0-100 range) for display as "Bid Depth" and "Ask Depth"
      yes_bid: yesBid,
      yes_ask: yesAsk,
      // Liquidity from trade-api v2 - ensure it's a number
      liquidity: Number(market.liquidity) || 0,
      open_interest: Number(market.open_interest) || 0,
      status: market.status || "open",
      result: market.result || null,
      // Date/time fields from Kalshi API
      open_time: market.open_ts || null,
      close_time: market.close_ts || null,
      expected_expiration_time: market.expected_expiration_ts || market.close_ts || null,
    };
  });

  // Calculate total volume from all markets
  const totalVolume = transformedMarkets.reduce((sum: number, m: any) => sum + (m.volume || 0), 0);
  const totalSeriesVolume = transformedMarkets.reduce((sum: number, m: any) => sum + (m.volume_24h || m.volume || 0), 0);

  // Extract event-level date/time information
  const eventOpenTime = event.open_ts || markets[0]?.open_ts || null;
  const eventCloseTime = event.close_ts || markets[0]?.close_ts || null;
  const eventExpirationTime = event.expected_expiration_ts || markets[0]?.expected_expiration_ts || markets[0]?.close_ts || null;

  // Use image_url from metadata if available, otherwise fall back to constructed URL
  const symbolImageUrl = metadataImageUrl || 
    `https://d1lvyva3zy5u58.cloudfront.net/series-images-webp/${event.series_ticker || eventTicker}.webp?size=sm`;

  // Return structured data matching MarketDetails type
  return NextResponse.json({
    series_ticker: event.series_ticker || eventTicker,
    title: event.title || "",
    subtitle: event.sub_title || "",
    category: event.category || "",
    markets: transformedMarkets, // Always return an array
    total_volume: totalVolume,
    total_series_volume: totalSeriesVolume,
    symbol_image_url: symbolImageUrl,
    // Event-level date/time information
    open_time: eventOpenTime,
    close_time: eventCloseTime,
    expected_expiration_time: eventExpirationTime,
    // Additional fields for external links
    event_ticker: event.event_ticker || eventTicker,
    ranged_group_name: event.series_title || event.title || "",
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}

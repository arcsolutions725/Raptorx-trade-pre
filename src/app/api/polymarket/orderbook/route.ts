/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import {
  createSimplePolymarketHeaders,
  getPolymarketCredentials,
} from "@/lib/api/polymarketAuth";
import { calculateTotalCost } from "@/utils/order";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clobTokenId = searchParams.get("clob_token_id");

    if (!clobTokenId) {
      return NextResponse.json(
        {
          error: "clob_token_id parameter is required",
        },
        { status: 400 }
      );
    }

    // Use Polymarket CLOB API
    // The CLOB API endpoint for order book: https://clob.polymarket.com/book
    // For Polymarket, we need the CLOB token ID
    const tokenId = clobTokenId;

    // CLOB API endpoint for order book
    const url = `https://clob.polymarket.com/book?token_id=${encodeURIComponent(
      tokenId
    )}`;

    console.log("url: ", url);

    // Get API credentials and create authenticated headers
    try {
      getPolymarketCredentials();
    } catch (error: any) {
      console.error("Polymarket API credentials error:", error.message);
      return NextResponse.json(
        {
          error: "API credentials not configured",
          details:
            "Please verify that POLYMARKET_API_KEY (and optionally POLYMARKET_API_SECRET, POLYMARKET_API_PASS_PHARSE) are correctly set in your environment variables.",
        },
        { status: 500 }
      );
    }

    const headers = createSimplePolymarketHeaders();

    console.log(
      "Fetching Polymarket order book:",
      url,
      "with token ID:",
      tokenId
    );

    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket CLOB API error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url,
        tokenId,
      });

      // Handle 404 specifically - order book might not exist for this token
      // Return empty order book instead of error to allow UI to continue working
      if (response.status === 404) {
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson.error || errorText;
        } catch {
          // Keep original error text if not JSON
        }

        console.warn(
          `Order book not found for token ID: ${tokenId}. Returning empty order book. Error: ${errorDetails}`
        );

        // Return empty order book structure instead of error
        return NextResponse.json(
          {
            bids: [],
            asks: [],
            spread: 0,
            spreadPercent: 0,
            bestBid: 0,
            bestAsk: 0,
            warning: `No orderbook exists for token ID: ${tokenId}. The market may be inactive or the token ID may be incorrect.`,
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
            },
          }
        );
      }

      // Handle 401 Unauthorized
      if (response.status === 401) {
        return NextResponse.json(
          {
            error: "Unauthorized - Invalid API key",
            details:
              "Please verify that POLYMARKET_API_KEY (and optionally POLYMARKET_API_SECRET, POLYMARKET_API_PASS_PHARSE) are correctly set in your environment variables and are valid.",
            status: 401,
          },
          { status: 401 }
        );
      }

      throw new Error(
        `Polymarket CLOB API returned ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();

    console.log(
      "Polymarket order book raw data:",
      JSON.stringify(data).substring(0, 1000)
    );

    // Transform the order book data to match TradeFox format
    // Polymarket CLOB API returns bids (buy orders) and asks (sell orders)
    // The API response structure can be:
    // - { bids: [{ price, size, ... }], asks: [{ price, size, ... }] }
    // - Or nested structure with levels
    // - Prices are in decimal format (0-1), sizes are in token units

    let bids: any[] = [];
    let asks: any[] = [];

    // Handle different response formats
    if (Array.isArray(data.bids) && Array.isArray(data.asks)) {
      bids = data.bids;
      asks = data.asks;
    } else if (data.levels && Array.isArray(data.levels)) {
      // Handle nested levels format
      bids = data.levels.filter(
        (level: any) => level.side === "bid" || level.side === "buy"
      );
      asks = data.levels.filter(
        (level: any) => level.side === "ask" || level.side === "sell"
      );
    } else if (data.book) {
      // Handle nested book structure
      bids = Array.isArray(data.book.bids) ? data.book.bids : [];
      asks = Array.isArray(data.book.asks) ? data.book.asks : [];
    }

    console.log(`Found ${bids.length} bids and ${asks.length} asks`);

    // Sort bids descending (highest price first) and asks ascending (lowest price first)
    // Polymarket prices are in decimal format (0-1), so we keep them as-is
    const sortedBids = bids
      .map((bid: any) => {
        // Handle different field names Polymarket might use
        // Price can be in different formats: decimal string, number, or nested
        let price: number;
        if (typeof bid.price === "number") {
          price = bid.price;
        } else if (typeof bid.price === "string") {
          price = parseFloat(bid.price);
        } else if (bid.priceNum !== undefined) {
          price = parseFloat(bid.priceNum);
        } else if (bid.price_num !== undefined) {
          price = parseFloat(bid.price_num);
        } else {
          price = 0;
        }

        // Size can be in different formats
        let size: number;
        if (typeof bid.size === "number") {
          size = bid.size;
        } else if (typeof bid.size === "string") {
          size = parseFloat(bid.size);
        } else if (bid.sizeNum !== undefined) {
          size = parseFloat(bid.sizeNum);
        } else if (bid.size_num !== undefined) {
          size = parseFloat(bid.size_num);
        } else if (bid.amount !== undefined) {
          size = parseFloat(bid.amount);
        } else {
          size = 0;
        }

        return {
          price: price,
          size: size,
          total: calculateTotalCost(size, price),
        };
      })
      .filter(
        (bid: any) =>
          !isNaN(bid.price) && !isNaN(bid.size) && bid.price > 0 && bid.size > 0
      )
      .sort((a, b) => b.price - a.price);

    const sortedAsks = asks
      .map((ask: any) => {
        // Handle different field names Polymarket might use
        let price: number;
        if (typeof ask.price === "number") {
          price = ask.price;
        } else if (typeof ask.price === "string") {
          price = parseFloat(ask.price);
        } else if (ask.priceNum !== undefined) {
          price = parseFloat(ask.priceNum);
        } else if (ask.price_num !== undefined) {
          price = parseFloat(ask.price_num);
        } else {
          price = 0;
        }

        let size: number;
        if (typeof ask.size === "number") {
          size = ask.size;
        } else if (typeof ask.size === "string") {
          size = parseFloat(ask.size);
        } else if (ask.sizeNum !== undefined) {
          size = parseFloat(ask.sizeNum);
        } else if (ask.size_num !== undefined) {
          size = parseFloat(ask.size_num);
        } else if (ask.amount !== undefined) {
          size = parseFloat(ask.amount);
        } else {
          size = 0;
        }

        return {
          price: price,
          size: size,
          total: calculateTotalCost(size, price),
        };
      })
      .filter(
        (ask: any) =>
          !isNaN(ask.price) && !isNaN(ask.size) && ask.price > 0 && ask.size > 0
      )
      .sort((a, b) => a.price - b.price);

    console.log(
      `Processed ${sortedBids.length} valid bids and ${sortedAsks.length} valid asks`
    );

    // Calculate spread
    const bestBid = sortedBids[0];
    const bestAsk = sortedAsks[0];
    const spread = bestAsk && bestBid ? bestAsk.price - bestBid.price : 0;
    const spreadPercent =
      bestBid && bestBid.price > 0 ? (spread / bestBid.price) * 100 : 0;

    return NextResponse.json(
      {
        bids: sortedBids,
        asks: sortedAsks,
        spread: spread,
        spreadPercent: spreadPercent,
        bestBid: bestBid?.price || 0,
        bestAsk: bestAsk?.price || 0,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
        },
      }
    );
  } catch (err: any) {
    console.error("Polymarket order book error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch Polymarket order book", details: msg },
      { status: 500 }
    );
  }
}

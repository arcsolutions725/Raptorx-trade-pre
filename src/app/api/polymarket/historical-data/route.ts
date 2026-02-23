/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clobTokenIdParam = searchParams.get("clob_token_id");
    const conditionId = searchParams.get("condition_id"); // Legacy support
    const marketId = searchParams.get("market_id"); // Legacy support
    const interval = searchParams.get("interval"); // Can be null for "ALL"
    // Legacy support for old parameters
    const from = searchParams.get("from"); // Unix timestamp
    const to = searchParams.get("to"); // Unix timestamp
    const resolution = searchParams.get("resolution"); // Legacy parameter

    // The prices-history endpoint requires the CLOB token ID
    // According to Polymarket docs: "The CLOB token ID for which to fetch price history"
    // This is the first token ID from clobTokenIds array (Yes token)
    let clobTokenId = clobTokenIdParam || conditionId || marketId;

    if (!clobTokenId) {
      return NextResponse.json(
        {
          error:
            "clob_token_id parameter is required (or condition_id/market_id for legacy support)",
        },
        { status: 400 },
      );
    }

    const pricesHistoryParams = new URLSearchParams({
      market: clobTokenId, // CLOB token ID (condition_id)
    });

    // Fidelity mapping for each interval
    const fidelityMap: { [key: string]: string } = {
      "1m": "180",
      "1w": "30",
      "1d": "5",
      "6h": "1",
      "1h": "1",
    };

    // For "ALL" (when interval is null or "all"), don't include interval parameter, but include startTs and fidelity=720
    if (!interval || interval.toLowerCase() === "all") {
      // Use a start timestamp to get historical data
      // The user's example shows startTs=1754414893, using current timestamp or a reasonable default
      const startTs = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60; // 1 year ago
      pricesHistoryParams.append("startTs", startTs.toString());
      pricesHistoryParams.append("fidelity", "720");
    } else {
      // For other intervals, convert to lowercase and include interval with appropriate fidelity
      const polymarketInterval = interval.toLowerCase();
      pricesHistoryParams.append("interval", polymarketInterval);

      // Get fidelity from map, default to "1" if not found
      const fidelity = fidelityMap[polymarketInterval] || "1";
      pricesHistoryParams.append("fidelity", fidelity);
    }

    const pricesHistoryUrl = `https://clob.polymarket.com/prices-history?${pricesHistoryParams.toString()}`;

    // The prices-history endpoint is public and doesn't require authentication
    // Use minimal headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const response = await fetch(pricesHistoryUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket prices-history API error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url: pricesHistoryUrl,
        clobTokenId,
        interval: interval || "all",
      });

      if (response.status === 401) {
        return NextResponse.json(
          {
            error: "Unauthorized - Invalid API key",
            details:
              "Please verify that POLYMARKET_API_KEY (and optionally POLYMARKET_API_SECRET, POLYMARKET_API_PASS_PHARSE) are correctly set in your environment variables and are valid.",
            status: 401,
          },
          { status: 401 },
        );
      }

      throw new Error(
        `Polymarket prices-history API returned ${response.status}: ${errorText}`,
      );
    }

    const data = await response.json();

    let history: any[] = [];

    if (data.history && Array.isArray(data.history)) {
      history = data.history;
    } else if (Array.isArray(data)) {
      // Fallback: if data is directly an array
      history = data;
    } else {
      console.warn("Unexpected data format:", data);
    }

    // If no data found, return empty response
    if (history.length === 0) {
      console.warn("No history data found in response");
      return NextResponse.json({
        s: "ok",
        t: [],
        o: [],
        h: [],
        l: [],
        c: [],
        v: [],
      });
    }

    // Transform the data to match expected OHLCV format
    // Polymarket returns: {t: timestamp in seconds, p: price as decimal (0-1)}
    // We need to convert to: {time, open, high, low, close, volume}
    // Since we only have price, we'll use the same price for open, high, low, close
    const transformed = history
      .map((item: any) => {
        // Handle the Polymarket format: {t: timestamp, p: price}
        const time = item.t;
        const price = item.p;

        // Validate required fields
        if (
          time === undefined ||
          time === null ||
          price === undefined ||
          price === null
        ) {
          console.warn("Invalid item in history:", item);
          return null;
        }

        // Timestamps are already in seconds (Unix timestamps)
        // Example: 1763953210 is already in seconds
        const timeSec = typeof time === "number" ? time : parseInt(time);

        // Filter by time range if provided (legacy support)
        const fromTimestamp = from ? parseInt(from) : null;
        const toTimestamp = to ? parseInt(to) : null;

        if (fromTimestamp && timeSec < fromTimestamp) return null;
        if (toTimestamp && timeSec > toTimestamp) return null;

        const priceNum = typeof price === "string" ? parseFloat(price) : price;

        // Validate numeric values
        if (isNaN(timeSec) || isNaN(priceNum)) {
          console.warn("Invalid numeric values:", {
            time,
            price,
            timeSec,
            priceNum,
          });
          return null;
        }

        // Use the same price for all OHLC values since Polymarket only provides price
        return {
          time: timeSec,
          open: priceNum,
          high: priceNum,
          low: priceNum,
          close: priceNum,
          volume: 0, // Volume not available in prices-history endpoint
        };
      })
      .filter(
        (item: any) =>
          item !== null && !isNaN(item?.time) && !isNaN(item?.close),
      )
      .sort((a: any, b: any) => (a?.time || 0) - (b?.time || 0));

    return NextResponse.json(
      {
        s: "ok", // Status: ok
        t: transformed.map((item) => item?.time || 0), // Timestamps
        o: transformed.map((item) => item?.open || 0), // Open prices
        h: transformed.map((item) => item?.high || 0), // High prices
        l: transformed.map((item) => item?.low || 0), // Low prices
        c: transformed.map((item) => item?.close || 0), // Close prices
        v: transformed.map((item) => item?.volume || 0), // Volumes
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err: any) {
    console.error("Polymarket historical data error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch Polymarket historical data", details: msg },
      { status: 500 },
    );
  }
}

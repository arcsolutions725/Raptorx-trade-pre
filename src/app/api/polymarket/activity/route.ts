/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get("market"); // Condition ID
    const eventId = searchParams.get("eventId");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");
    const filterType = searchParams.get("filterType") || "CASH"; // CASH or TOKENS
    const filterAmount = searchParams.get("filterAmount"); // Minimum amount filter

    // Build URL for Polymarket trades API
    // https://data-api.polymarket.com/trades
    const params = new URLSearchParams({
      limit: Math.min(limit, 500).toString(),
      offset: offset.toString(),
    });

    if (market) {
      params.append("market", market);
    } else if (eventId) {
      params.append("eventId", eventId);
    } else {
      return NextResponse.json(
        { error: "market or eventId parameter is required" },
        { status: 400 }
      );
    }

    if (filterType) {
      params.append("filterType", filterType);
    }

    if (filterAmount) {
      params.append("filterAmount", filterAmount);
    }

    const tradesUrl = `https://data-api.polymarket.com/trades?${params.toString()}`;
    

    const response = await fetch(tradesUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket trades API error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url: tradesUrl,
      });
      throw new Error(`Polymarket trades API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();


    // The API returns an array of trade objects
    const trades = Array.isArray(data) ? data : [];

    return NextResponse.json({
      trades: trades,
      total: trades.length,
      hasMore: trades.length === limit,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch (err: any) {
    console.error("Polymarket activity error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch Polymarket activity", details: msg },
      { status: 500 }
    );
  }
}


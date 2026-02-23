/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seriesTicker = searchParams.get("series_ticker");
    const pageSize = searchParams.get("page_size") || "20";

    if (!seriesTicker) {
      return NextResponse.json(
        { error: "series_ticker parameter is required" },
        { status: 400 }
      );
    }

    // Use Kalshi social API for trades/activity
    // https://api.elections.kalshi.com/v1/social/trades?series_ticker=KXFEDDECISION&page_size=20
    const url = `https://api.elections.kalshi.com/v1/social/trades?${new URLSearchParams({
      series_ticker: seriesTicker,
      page_size: pageSize,
    }).toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Kalshi activity API error response:", errorText);
      throw new Error(`Kalshi API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Kalshi activity API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch activity";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

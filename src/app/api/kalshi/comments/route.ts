/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventTicker = searchParams.get("event_ticker");
    const limit = searchParams.get("limit") || "20";
    const includeComments = searchParams.get("include_comments") || "true";
    const commentsMaxDepth = searchParams.get("comments_max_depth") || "3";

    if (!eventTicker) {
      return NextResponse.json(
        { error: "event_ticker parameter is required" },
        { status: 400 }
      );
    }

    // Use Kalshi social API for comments
    // https://api.elections.kalshi.com/v1/social/timeline?event_ticker=KXFEDDECISION-26JAN&limit=20&include_comments=true&comments_max_depth=3
    const url = `https://api.elections.kalshi.com/v1/social/timeline?${new URLSearchParams({
      event_ticker: eventTicker,
      limit,
      include_comments: includeComments,
      comments_max_depth: commentsMaxDepth,
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
      console.error("Kalshi comments API error response:", errorText);
      throw new Error(`Kalshi API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Kalshi comments API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch comments";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

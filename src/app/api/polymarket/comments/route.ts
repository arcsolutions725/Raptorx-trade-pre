/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get("market_id");
    const eventId = searchParams.get("event_id");
    const seriesId = searchParams.get("series_id");
    const parentEntityType = searchParams.get("parent_entity_type") || "Event";

    // Determine entity ID and parent entity type based on series_id
    let entityId: string | null = null;
    let finalParentEntityType = parentEntityType;
    
    if (seriesId) {
      // If series_id is provided, use it with Series type
      entityId = seriesId;
      finalParentEntityType = "Series";
    } else if (eventId) {
      // If series_id is null but event_id is provided, use event_id with Event type
      entityId = eventId;
      finalParentEntityType = "Event";
    } else if (marketId) {
      // Fallback to market_id for backward compatibility
      entityId = marketId;
    }

    if (!entityId) {
      return NextResponse.json(
        { error: "series_id, event_id, or market_id parameter is required" },
        { status: 400 }
      );
    }

    // Convert entityId to integer (parent_entity_id must be an integer)
    const parentEntityId = parseInt(entityId, 10);
    if (isNaN(parentEntityId)) {
      return NextResponse.json(
        { error: "series_id, event_id, or market_id must be a valid integer" },
        { status: 400 }
      );
    }

    // Get query parameters with defaults per Polymarket API docs
    const limit = parseInt(searchParams.get("limit") || "40", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const ascending = searchParams.get("ascending") === "true";
    const holdersOnly = searchParams.get("holders_only") === "true";
    const getPositions = searchParams.get("get_positions") !== "false"; // Default to true
    const getReports = searchParams.get("get_reports") !== "false"; // Default to true
    const order = searchParams.get("order") || "createdAt";

    // Validate required parameters per docs
    if (limit < 0 || offset < 0) {
      return NextResponse.json(
        { error: "limit and offset must be >= 0" },
        { status: 400 }
      );
    }

    // Build query parameters for Polymarket comments API
    // According to docs: https://docs.polymarket.com/api-reference/comments/list-comments
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      order: order,
      ascending: ascending.toString(),
      parent_entity_type: finalParentEntityType,
      parent_entity_id: parentEntityId.toString(),
      get_positions: getPositions.toString(),
      holders_only: holdersOnly.toString(),
    });

    const url = `https://gamma-api.polymarket.com/comments?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket comments API error response:", errorText);
      throw new Error(`Polymarket API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Return the comments array
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error: any) {
    console.error("Error fetching Polymarket comments:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch comments" },
      { status: 500 }
    );
  }
}


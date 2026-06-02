/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import {
  fetchLimitlessMarketDocument,
  limitlessApiDocumentToRexMarketDetails,
} from "@/lib/limitless/marketDocument";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug") || searchParams.get("id") || searchParams.get("ticker");
    
    if (!slug) {
      return NextResponse.json(
        { error: "Slug, id, or ticker parameter is required" },
        { status: 400 }
      );
    }

    const data = await fetchLimitlessMarketDocument(slug);
    const marketDetails = limitlessApiDocumentToRexMarketDetails(data);

    return NextResponse.json(marketDetails, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Limitless API error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch market details";
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

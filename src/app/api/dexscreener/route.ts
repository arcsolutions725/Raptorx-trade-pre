// src/app/api/dexscreener/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDexscreenerData } from "@/lib/api/dexscreener";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractAddress = searchParams.get("contractAddress");

    if (!contractAddress) {
      return NextResponse.json(
        { error: "Contract address is required" },
        { status: 400 }
      );
    }

    console.log(`🔍 Fetching latest DexScreener data for: ${contractAddress}`);

    const dexData = await getDexscreenerData(contractAddress);

    if ("error" in dexData) {
      console.error(`❌ DexScreener API error: ${dexData.error}`);
      return NextResponse.json({ error: dexData.error }, { status: 500 });
    }

    console.log(`✅ Successfully fetched DexScreener data`);

    return NextResponse.json(dexData, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("❌ DexScreener API route error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch DexScreener data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Static categories data - category API is no longer working
    // Using static categories that can be used with the tag API
    const tagsByCategory: Record<string, string[]> = {
      Politics: ["politics"],
      Sports: ["sports"],
      Crypto: ["crypto"],
      Finance: ["finance"],
      Geopolitics: ["geopolitics"],
      Earnings: ["earnings"],
      Tech: ["tech"],
      Culture: ["pop-culture"],
      World: ["world"],
      Economy: ["economy"],
      Trump: ["trump"],
      Elections: ["elections"],
      Mentions: ["mention-markets"],
    };

    return NextResponse.json(
      { tags_by_categories: tagsByCategory },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    console.error("Polymarket categories error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch categories";

    return NextResponse.json(
      { error: errorMessage, tags_by_categories: {} },
      { status: 500 }
    );
  }
}

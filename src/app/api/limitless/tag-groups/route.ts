import { NextRequest, NextResponse } from "next/server";

export type LimitlessTagGroup = {
  name: string;
  paramKey: string;
  tags: { name: string; paramValue: string }[];
};

// Category IDs from /navigation that have tag groups (Crypto, Sport, Finance). Others (e.g. Other, Culture, Politics) have no tags.
const TAG_GROUPS_BY_CATEGORY_ID: Record<string, LimitlessTagGroup[]> = {
  // Crypto - id from navigation
  "5e76699e-8763-4c91-85de-3efeb064efec": [
    { name: "DURATION", paramKey: "duration", tags: [{ name: "Hourly", paramValue: "hourly" }, { name: "Daily", paramValue: "daily" }, { name: "Weekly", paramValue: "weekly" }] },
    { name: "TYPE", paramKey: "type", tags: [{ name: "Pre-TGE", paramValue: "pre-tge" }] },
    { name: "TICKER", paramKey: "ticker", tags: [{ name: "Bitcoin", paramValue: "bitcoin" }, { name: "Ethereum", paramValue: "ethereum" }, { name: "Solana", paramValue: "solana" }] },
  ],
  // Sport
  "2a91349c-3308-4234-afb7-0663e42968c1": [
    { name: "SPORTS", paramKey: "sports", tags: [{ name: "Esports", paramValue: "esports" }, { name: "Cricket", paramValue: "cricket" }, { name: "Winter Olympics", paramValue: "winter-olympics" }, { name: "NHL", paramValue: "nhl" }, { name: "NBA", paramValue: "nba" }] },
    { name: "FOOTBALL FAN", paramKey: "football-fan", tags: [{ name: "Off the Pitch", paramValue: "off-the-pitch" }] },
    { name: "FOOTBALL", paramKey: "football", tags: [{ name: "England Premier League", paramValue: "england-premier-league" }, { name: "England FA CUP", paramValue: "england-fa-cup" }, { name: "England EFL CUP", paramValue: "england-efl-cup" }, { name: "England EFL Championship", paramValue: "england-efl-championship" }, { name: "Bundesliga", paramValue: "bundesliga" }] },
  ],
  // Finance
  "4962ba38-2482-4e33-beff-2d3eb49f15bb": [
    { name: "DURATION", paramKey: "duration", tags: [{ name: "Hourly", paramValue: "hourly" }, { name: "Daily", paramValue: "daily" }, { name: "Weekly", paramValue: "weekly" }] },
    { name: "FINANCE EVENTS", paramKey: "finance-events", tags: [{ name: "This vs That", paramValue: "this-vs-that" }, { name: "Economy", paramValue: "economy" }, { name: "Company News", paramValue: "company-news" }] },
  ],
};

/**
 * GET /api/limitless/tag-groups?categoryId=...
 * Returns tag groups and tags for a category. Only Crypto, Sport, Finance have tags; others return [].
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId")?.trim();

    if (!categoryId) {
      return NextResponse.json(
        { tagGroups: [] },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    const tagGroups = TAG_GROUPS_BY_CATEGORY_ID[categoryId] ?? [];

    return NextResponse.json(
      { tagGroups },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    console.error("Limitless tag-groups error:", error);
    return NextResponse.json(
      { tagGroups: [] },
      { status: 500 }
    );
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { sortLimitlessMarketsByVolumeDesc } from "@/lib/limitless/sortMarketsByVolume";

/**
 * Transform a Limitless event (group with optional sub-markets) to table shape.
 * Same logic as Polymarket: when markets.length >= 2 show Choice I/II (first two sub-markets' yes price);
 * when markets.length === 1 or single market show Yes/No price. Volume from volumeFormatted (event or sum of sub-markets).
 */
function transformLimitlessEvent(event: any): any {
  const status = event.status || "";
  const active = status === "FUNDED" || status === "ACTIVE";
  const closed = status === "CLOSED" || status === "RESOLVED";
  const archived = status === "ARCHIVED";

  const subMarkets = Array.isArray(event.markets) ? event.markets : [];
  const marketsLength = subMarkets.length;

  let yesPrice: string | number = "—";
  let noPrice: string | number = "—";
  let choiceI: string | number = "—";
  let choiceII: string | number = "—";

  if (marketsLength >= 2) {
    // Show first two sub-markets' yes price as Choice I / Choice II (same as Polymarket)
    const first = subMarkets[0];
    const second = subMarkets[1];
    const p0 = first?.prices?.[0];
    const p1 = second?.prices?.[0];
    if (p0 !== undefined && p0 !== null) {
      choiceI = Math.round(parseFloat(String(p0)) * 10000) / 100;
    }
    if (p1 !== undefined && p1 !== null) {
      choiceII = Math.round(parseFloat(String(p1)) * 10000) / 100;
    }
  } else if (marketsLength === 1) {
    // Single sub-market: show Yes/No price
    const m = subMarkets[0];
    const prices = m?.prices || [];
    if (prices[0] !== undefined && prices[0] !== null) {
      yesPrice = Math.round(parseFloat(String(prices[0])) * 10000) / 100;
    }
    if (prices[1] !== undefined && prices[1] !== null) {
      noPrice = Math.round(parseFloat(String(prices[1])) * 10000) / 100;
    }
  } else {
    // No sub-markets: treat root as single market (e.g. event.prices)
    const prices = event.prices || [];
    if (prices[0] !== undefined && prices[0] !== null) {
      yesPrice = Math.round(parseFloat(String(prices[0])) * 10000) / 100;
    }
    if (prices[1] !== undefined && prices[1] !== null) {
      noPrice = Math.round(parseFloat(String(prices[1])) * 10000) / 100;
    }
  }

  // Volume: use event.volumeFormatted for display; keep volumeNum for sorting (parse when numeric)
  let volumeNum = 0;
  let volumeFormattedDisplay = "";
  if (event.volumeFormatted != null && event.volumeFormatted !== "") {
    volumeFormattedDisplay = String(event.volumeFormatted).trim();
    const v = parseFloat(String(event.volumeFormatted));
    if (Number.isFinite(v)) volumeNum = v;
  } else if (event.volume != null) {
    const v = typeof event.volume === "string" ? parseFloat(event.volume) : Number(event.volume);
    if (Number.isFinite(v)) volumeNum = v;
  } else if (subMarkets.length > 0) {
    volumeNum = subMarkets.reduce((sum: number, m: any) => {
      if (m?.volumeFormatted != null && m.volumeFormatted !== "") {
        const v = parseFloat(String(m.volumeFormatted));
        return sum + (Number.isFinite(v) ? v : 0);
      }
      if (m?.volume != null) {
        const v = typeof m.volume === "string" ? parseFloat(m.volume) : Number(m.volume);
        return sum + (Number.isFinite(v) ? v : 0);
      }
      return sum;
    }, 0);
    if (!volumeFormattedDisplay && subMarkets[0]?.volumeFormatted) {
      volumeFormattedDisplay = String(subMarkets[0].volumeFormatted).trim();
    }
  }

  return {
    id: String(event.id || event.slug || ""),
    ticker: event.slug || String(event.id || ""),
    slug: event.slug || String(event.id || ""),
    title: event.title || "",
    subtitle: event.tags?.[0] || "Limitless",
    description: "",
    image: event.logo || event.imageUrl || null,
    icon: event.logo || event.imageUrl || null,
    active,
    closed,
    archived,
    volume: volumeNum,
    volume24hr: volumeNum,
    volumeFormatted: volumeFormattedDisplay || undefined,
    liquidity: 0,
    yesPrice,
    noPrice,
    choiceI,
    choiceII,
    markets: subMarkets,
    tags: event.tags || [],
    rawEventData: event,
  };
}

/**
 * GET /api/limitless/markets-by-category?categoryId=...&page=1&limit=24&sort=deadline
 * Proxies https://api.limitless.exchange/market-pages/{categoryId}/markets
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "24";
    const sort = searchParams.get("sort") || "deadline";

    if (!categoryId || !categoryId.trim()) {
      return NextResponse.json(
        { error: "categoryId is required" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      page,
      limit,
      sort,
    });
    // Forward any tag filter params (e.g. duration=hourly, ticker=bitcoin)
    searchParams.forEach((value, key) => {
      if (key !== "categoryId" && key !== "page" && key !== "limit" && key !== "sort" && value) {
        params.set(key, value);
      }
    });
    const url = `https://api.limitless.exchange/market-pages/${encodeURIComponent(categoryId.trim())}/markets?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Limitless market-pages API error:", errorText);
      return NextResponse.json(
        { error: `Limitless API ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    let marketsArray: any[] = [];
    if (data.data && Array.isArray(data.data)) {
      marketsArray = data.data;
    } else if (Array.isArray(data)) {
      marketsArray = data;
    }

    const markets = sortLimitlessMarketsByVolumeDesc(
      marketsArray.map(transformLimitlessEvent).filter(Boolean),
    );
    const hasMore = markets.length === parseInt(limit, 10);
    const totalCount = data.total ?? data.count ?? data.totalCount ?? markets.length;

    return NextResponse.json(
      { markets, count: totalCount, hasMore },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Limitless markets-by-category error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch category markets";
    return NextResponse.json(
      { error: message, markets: [], count: 0 },
      { status: 500 }
    );
  }
}

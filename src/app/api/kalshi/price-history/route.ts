/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

/** Kalshi v2 candlesticks only allows 1, 60, or 1440 (minutes). Map client period (seconds) to one of these. */
function periodSecondsToKalshiMinutes(periodSeconds: number): 1 | 60 | 1440 {
  if (periodSeconds <= 60) return 1;
  if (periodSeconds <= 3600) return 60;
  return 1440;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seriesTicker = searchParams.get("series_ticker");
    // Kalshi path is series/{series_ticker}/markets/{ticker}/candlesticks — value must be market ticker.
    const marketId = searchParams.get("market_id");
    const startTsParam = searchParams.get("start_ts");
    const endTsParam = searchParams.get("end_ts");
    const periodParam = searchParams.get("period_interval") || "60";

    if (!seriesTicker || !marketId) {
      return NextResponse.json(
        { error: "series_ticker and market_id parameters are required" },
        { status: 400 }
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const startTs = startTsParam ? parseInt(startTsParam, 10) : nowSec - 90 * 24 * 3600;
    const endTs = endTsParam ? parseInt(endTsParam, 10) : nowSec;
    const periodSeconds = parseInt(periodParam, 10) || 60;
    const periodInterval = periodSecondsToKalshiMinutes(periodSeconds);

    // Use Kalshi v2 candlesticks API (v1 forecast_history is deprecated and requires StartTs/EndTs/PeriodInterval oneof).
    // https://docs.kalshi.com/api-reference/market/get-market-candlesticks
    const url = `https://api.elections.kalshi.com/trade-api/v2/series/${encodeURIComponent(
      seriesTicker
    )}/markets/${encodeURIComponent(marketId)}/candlesticks?${new URLSearchParams(
      {
        start_ts: String(startTs),
        end_ts: String(endTs),
        period_interval: String(periodInterval),
      }
    ).toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Kalshi price history API error response:", errorText);
      throw new Error(`Kalshi API returned ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();

    const rawHistory: any[] = data?.candlesticks ?? [];

    const history = rawHistory
      .map((pt) => {
        const ts = Number(pt?.end_period_ts ?? pt?.ts ?? pt?.timestamp ?? pt?.t);
        const priceObj = pt?.price;
        let price = 0;
        if (priceObj != null) {
          const meanD = priceObj.mean_dollars ?? priceObj.close_dollars;
          const meanN = priceObj.mean ?? priceObj.close;
          if (typeof meanD === "string") price = parseFloat(meanD) || 0;
          else if (Number.isFinite(meanN)) price = meanN;
        }
        if (!Number.isFinite(price))
          price = Number(
            pt?.mean_price ??
              pt?.open_price ??
              pt?.close_price ??
              pt?.high_price ??
              pt?.low_price ??
              pt?.c
          );
        const volume =
          pt?.volume === undefined || pt?.volume === null
            ? undefined
            : Number(pt.volume);

        if (!Number.isFinite(ts) || !Number.isFinite(price)) return null;
        return { ts, price, ...(Number.isFinite(volume) ? { volume } : {}) };
      })
      .filter(Boolean);

    return NextResponse.json({ history });
  } catch (error) {
    console.error("Kalshi price history API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch price history";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

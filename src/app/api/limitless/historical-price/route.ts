/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/limitless/historical-price?slug=...&interval=1H|6H|1D|1W|1M|ALL
 * Proxies to: GET https://api.limitless.exchange/markets/{slug}/historical-price?interval=...
 * Returns normalized { history: [{ ts, price }] } for chart (ts in seconds, price 0-1).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const rawInterval = searchParams.get("interval") || "1W";

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    // Limitless API expects lowercase: 1h, 6h, 1d, 1w, 1m, all (UI uses 1H, 6H, 1D, 1W, 1M, ALL)
    const interval = rawInterval.toLowerCase();
    const params = new URLSearchParams({ interval });
    const url = `https://api.limitless.exchange/markets/${encodeURIComponent(slug)}/historical-price?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Limitless historical-price error:", err);
      return NextResponse.json(
        { error: `Limitless API ${response.status}: ${err}` },
        { status: response.status },
      );
    }

    const data = (await response.json()) as any;

    // Normalize to { history: [{ ts, price }] } and optionally { markets: [{ title, slug?, history }] }
    type HistoryPoint = { ts: number; price: number };
    const isHistoryPoint = (x: HistoryPoint | null): x is HistoryPoint =>
      x !== null;

    const toPoint = (pt: any): HistoryPoint | null => {
      const rawTs = pt?.timestamp ?? pt?.ts ?? pt?.t ?? pt?.time ?? 0;
      const tsNum = Number(rawTs);
      const ts = tsNum > 1e12 ? Math.floor(tsNum / 1000) : tsNum;
      const price = Number(pt?.price ?? pt?.p ?? pt?.close ?? pt?.mean ?? 0);
      if (!Number.isFinite(ts) || !Number.isFinite(price)) return null;
      return { ts, price: price > 1 ? price / 100 : price };
    };

    let history: HistoryPoint[] = [];
    const markets: { title: string; slug?: string; history: HistoryPoint[] }[] =
      [];

    // Response format: array of { title, slug?, prices: [{ timestamp, price }] } (see price-history.json) – one event, multiple markets
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first?.prices && Array.isArray(first.prices)) {
        // Multi-market: each element is { title, slug?, prices: [...] }
        for (const row of data) {
          const title = row?.title ?? row?.slug ?? "";
          const slug = row?.slug;
          const pts = Array.isArray(row?.prices)
            ? row.prices.map((pt: any) => toPoint(pt)).filter(isHistoryPoint)
            : [];
          markets.push({ title, slug, history: pts });
        }
        // Backward compat: single history = first market's history
        history = markets[0]?.history ?? [];
      } else {
        history = data.map((pt: any) => toPoint(pt)).filter(isHistoryPoint);
      }
    } else if (Array.isArray(data)) {
      history = data.map((pt: any) => toPoint(pt)).filter(isHistoryPoint);
    } else if (data?.data && Array.isArray(data.data)) {
      history = data.data.map((pt: any) => toPoint(pt)).filter(isHistoryPoint);
    } else if (data?.history && Array.isArray(data.history)) {
      history = data.history
        .map((pt: any) => toPoint(pt))
        .filter(isHistoryPoint);
    } else if (data?.prices && Array.isArray(data.prices)) {
      // Single market: { title, prices: [{ timestamp, price }], marketStatus? }
      history = data.prices
        .map((pt: any) => toPoint(pt))
        .filter(isHistoryPoint);
    } else if (
      data?.t &&
      data?.c &&
      Array.isArray(data.t) &&
      Array.isArray(data.c)
    ) {
      const len = Math.min(data.t.length, data.c.length);
      for (let i = 0; i < len; i++) {
        const ts = Number(data.t[i]);
        const price = Number(data.c[i]);
        if (Number.isFinite(ts) && Number.isFinite(price)) {
          history.push({
            ts: ts > 1e12 ? Math.floor(ts / 1000) : ts,
            price: price > 1 ? price / 100 : price,
          });
        }
      }
    }

    return NextResponse.json(
      markets.length > 0 ? { history, markets } : { history },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("Limitless historical-price error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch historical price";
    return NextResponse.json({ error: message, history: [] }, { status: 500 });
  }
}

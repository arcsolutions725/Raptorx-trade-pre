import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  PORTFOLIO_RANGES,
  type PortfolioHistoryResponse,
  type PortfolioRange,
  type PricePoint,
} from "@/lib/portfolio/types";

/**
 * GET /api/portfolio/history?range=30D&pools=<token key>:<pool>:<priced contract>,…
 *
 * USD close prices per token over the range, from the token's deepest pool on Base (GeckoTerminal, no key).
 * The Portfolio page multiplies them by what each wallet holds now, so the chart is the value of today's
 * holdings over time. Each pool + range is cached, so the 30-calls-a-minute limit is rarely reached.
 */

export const dynamic = "force-dynamic";

const MAX_POOLS = 25;
const ADDR = /^0x[0-9a-f]{40}$/;

/** GeckoTerminal OHLCV: timeframe, aggregate, limit; plus how long a cached series stays fresh. */
const RANGE_QUERY: Record<PortfolioRange, { tf: "minute" | "hour" | "day"; agg: number; limit: number; ttl: number }> = {
  "24H": { tf: "minute", agg: 15, limit: 100, ttl: 120 },
  "7D": { tf: "hour", agg: 4, limit: 45, ttl: 600 },
  "30D": { tf: "hour", agg: 12, limit: 64, ttl: 1800 },
  "90D": { tf: "day", agg: 1, limit: 92, ttl: 3600 },
  ALL: { tf: "day", agg: 1, limit: 366, ttl: 3600 },
};

const fetchSeries = (range: PortfolioRange, pool: string, token: string) => {
  const q = RANGE_QUERY[range];
  return unstable_cache(
    async (): Promise<PricePoint[]> => {
      const url =
        `https://api.geckoterminal.com/api/v2/networks/base/pools/${pool}/ohlcv/${q.tf}` +
        `?aggregate=${q.agg}&limit=${q.limit}&currency=usd&token=${token}`;
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`geckoterminal ${r.status}`); // thrown → not cached
      const j = (await r.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
      const list = j.data?.attributes?.ohlcv_list ?? [];
      return list
        .map((c): PricePoint => [Number(c[0]), Number(c[4])])
        .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p) && p > 0)
        .sort((a, b) => a[0] - b[0]);
    },
    ["portfolio-ohlcv-v1", range, pool, token],
    { revalidate: q.ttl },
  )();
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const range = (sp.get("range") || "30D").toUpperCase() as PortfolioRange;
  if (!PORTFOLIO_RANGES.includes(range)) {
    return NextResponse.json({ error: "range: 24H, 7D, 30D, 90D or ALL" }, { status: 400 });
  }
  // the key is "native" for ETH, which is priced from a WETH pool (the priced contract is then WETH)
  const pairs = (sp.get("pools") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase().split(":"))
    .filter(([key, pool, priced]) => key && ADDR.test(pool ?? "") && ADDR.test(priced ?? ""))
    .slice(0, MAX_POOLS) as [string, string, string][];

  const series: PortfolioHistoryResponse["series"] = {};
  // a few at a time, to stay friendly with the public API
  for (let i = 0; i < pairs.length; i += 4) {
    await Promise.all(
      pairs.slice(i, i + 4).map(async ([key, pool, priced]) => {
        try {
          const s = await fetchSeries(range, pool, priced);
          if (s.length) series[key] = s;
        } catch (err) {
          console.warn("[portfolio/history]", key, String(err));
        }
      }),
    );
  }
  const body: PortfolioHistoryResponse = { range, series };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

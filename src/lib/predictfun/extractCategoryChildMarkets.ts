/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PredictFunApiMarket } from "@/lib/predictfun/mapPredictFunMarketRow";

function mergeMarketDataStats(
  markets: PredictFunApiMarket[],
  marketData: unknown
): PredictFunApiMarket[] {
  if (!Array.isArray(marketData) || marketData.length === 0) return markets;

  const statsById = new Map<string, Record<string, unknown>>();
  const statsByTitle = new Map<string, Record<string, unknown>>();

  for (const row of marketData) {
    if (!row || typeof row !== "object") continue;
    const r = row as {
      marketId?: string | number;
      id?: string | number;
      title?: string;
      statistics?: Record<string, unknown>;
      stats?: Record<string, unknown>;
    };
    const stats = r.statistics ?? r.stats;
    if (!stats || typeof stats !== "object") continue;
    const id = String(r.marketId ?? r.id ?? "").trim();
    const title = String(r.title ?? "").trim().toLowerCase();
    if (id) statsById.set(id, stats);
    if (title) statsByTitle.set(title, stats);
  }

  if (statsById.size === 0 && statsByTitle.size === 0) return markets;

  return markets.map((market) => {
    const id = String(market.id ?? "").trim();
    const title = String(market.title ?? market.question ?? "")
      .trim()
      .toLowerCase();
    const stats =
      (id ? statsById.get(id) : undefined) ??
      (title ? statsByTitle.get(title) : undefined);
    if (!stats) return market;
    return {
      ...market,
      statistics: {
        ...(market.statistics ?? {}),
        ...stats,
      },
      stats: {
        ...(market.stats ?? {}),
        ...stats,
      },
    };
  });
}

/** Normalize child markets from GET /categories/:slug (array or GraphQL-style edges). */
export function extractPredictFunCategoryChildMarkets(
  raw: Record<string, unknown> | null | undefined
): PredictFunApiMarket[] {
  if (!raw || typeof raw !== "object") return [];

  const markets = raw.markets as unknown;
  let children: PredictFunApiMarket[] = [];

  if (Array.isArray(markets)) {
    children = markets.filter(
      (m): m is PredictFunApiMarket => m && typeof m === "object"
    );
  } else {
    const edges = (markets as { edges?: unknown })?.edges;
    if (Array.isArray(edges)) {
      children = edges
        .map((e: any) => e?.node)
        .filter((m): m is PredictFunApiMarket => m && typeof m === "object");
    }
  }

  return mergeMarketDataStats(children, raw.marketData);
}

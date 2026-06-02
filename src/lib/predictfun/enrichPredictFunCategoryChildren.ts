/* eslint-disable @typescript-eslint/no-explicit-any */
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";
import {
  normalizePredictFunOutcomes,
  predictFunVolumeFromRaw,
  type PredictFunApiMarket,
} from "@/lib/predictfun/mapPredictFunMarketRow";

function childNeedsStatsEnrichment(market: PredictFunApiMarket): boolean {
  const vol = predictFunVolumeFromRaw(market);
  return vol.volume24hUsd <= 0 && vol.volumeTotalUsd <= 0 && vol.liquidityUsd <= 0;
}

function mergeChildMarket(
  base: PredictFunApiMarket,
  detail: Record<string, unknown>
): PredictFunApiMarket {
  const stats =
    (detail.statistics as PredictFunApiMarket["statistics"]) ??
    (detail.stats as PredictFunApiMarket["stats"]) ??
    base.statistics ??
    base.stats;
  const normalizedOutcomes = normalizePredictFunOutcomes(detail);
  return {
    ...base,
    ...detail,
    statistics: stats,
    stats,
    outcomes:
      normalizedOutcomes.length > 0
        ? normalizedOutcomes
        : normalizePredictFunOutcomes(base),
  } as PredictFunApiMarket;
}

/** Fetch GET /markets/:id for category children missing volume/liquidity stats. */
export async function enrichPredictFunCategoryChildren(
  children: PredictFunApiMarket[]
): Promise<PredictFunApiMarket[]> {
  if (children.length === 0) return children;

  const toFetch = children.filter(childNeedsStatsEnrichment);
  if (toFetch.length === 0) {
    return children.map((m) => ({
      ...m,
      outcomes: normalizePredictFunOutcomes(m),
    })) as PredictFunApiMarket[];
  }

  const params = new URLSearchParams({ includeStats: "true" });
  const detailById = new Map<string, Record<string, unknown>>();

  await Promise.all(
    toFetch.map(async (child) => {
      const id = String(child.id ?? "").trim();
      if (!id) return;
      const res = await predictFunGetJson(
        `/markets/${encodeURIComponent(id)}`,
        params
      );
      if (!res.ok || !res.body) return;
      const raw =
        (res.body as { data?: Record<string, unknown> }).data ??
        (res.body as Record<string, unknown>);
      if (raw && typeof raw === "object") {
        detailById.set(id, raw);
      }
    })
  );

  return children.map((child) => {
    const id = String(child.id ?? "").trim();
    const detail = id ? detailById.get(id) : undefined;
    const normalized = normalizePredictFunOutcomes(child);
    if (!detail) {
      return {
        ...child,
        outcomes: normalized.length > 0 ? normalized : child.outcomes,
      } as PredictFunApiMarket;
    }
    return mergeChildMarket(
      {
        ...child,
        outcomes: normalized.length > 0 ? normalized : child.outcomes,
      },
      detail
    );
  });
}

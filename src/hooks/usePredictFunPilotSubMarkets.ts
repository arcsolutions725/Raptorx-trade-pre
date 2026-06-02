"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  predictFunVolumeFromRaw,
  type PredictFunApiMarket,
} from "@/lib/predictfun/mapPredictFunMarketRow";
import { getPredictFunChildMarketsFromDetails } from "@/lib/predictfun/predictFunPilotData";
import type { MarketDetails } from "@/hooks/useMarketDetails";

async function fetchPredictFunSubMarket(
  marketId: string
): Promise<PredictFunApiMarket | null> {
  const res = await fetch(
    `/api/predictfun/market-details?id=${encodeURIComponent(marketId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const raw = json?.rawEventData as PredictFunApiMarket | undefined;
  if (raw && typeof raw === "object" && !Array.isArray((raw as { childMarkets?: unknown }).childMarkets)) {
    return raw;
  }
  return null;
}

function childNeedsEnrichment(child: PredictFunApiMarket): boolean {
  const vol = predictFunVolumeFromRaw(child);
  if (vol.volume24hUsd > 0 || vol.volumeTotalUsd > 0 || vol.liquidityUsd > 0) {
    return false;
  }
  const outs = child.outcomes;
  if (Array.isArray(outs) && outs.some((o) => o?.bestBid || o?.bestAsk)) {
    return false;
  }
  return true;
}

/** Client-side enrichment for Rex Pilot table when category children lack stats/outcomes. */
export function usePredictFunPilotSubMarkets(
  marketDetails: MarketDetails | null | undefined,
  enabled = true
) {
  const children = useMemo(
    () => getPredictFunChildMarketsFromDetails(marketDetails),
    [marketDetails]
  );

  const childrenNeedingFetch = useMemo(
    () =>
      children
        .map((child, index) => ({ child, index }))
        .filter(({ child }) => childNeedsEnrichment(child)),
    [children]
  );

  const queries = useQueries({
    queries: childrenNeedingFetch.map(({ child }) => ({
      queryKey: ["predictfun-pilot-submarket", String(child.id ?? "")],
      enabled: enabled && !!child.id,
      queryFn: async () => fetchPredictFunSubMarket(String(child.id)),
      staleTime: 30_000,
    })),
  });

  const enrichedChildren = useMemo(() => {
    if (children.length === 0) return children;
    const detailById = new Map<string, PredictFunApiMarket>();
    childrenNeedingFetch.forEach(({ child }, queryIdx) => {
      const detail = queries[queryIdx]?.data;
      const id = String(child.id ?? "").trim();
      if (detail && id) detailById.set(id, detail);
    });

    return children.map((child) => {
      const id = String(child.id ?? "").trim();
      const detail = id ? detailById.get(id) : undefined;
      if (!detail) return child;
      return {
        ...child,
        ...detail,
        statistics: detail.statistics ?? child.statistics,
        stats: detail.stats ?? child.stats,
        outcomes: detail.outcomes ?? child.outcomes,
      } as PredictFunApiMarket;
    });
  }, [children, childrenNeedingFetch, queries]);

  const isEnriching = queries.some((q) => q.isLoading || q.isFetching);

  return { enrichedChildren, isEnriching };
}

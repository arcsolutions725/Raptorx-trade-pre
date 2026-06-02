"use client";

import { useQuery } from "@tanstack/react-query";
import {
  extractPredictFunList,
  type PredictFunActivityItem,
  mapPredictFunMatchToActivityItems,
} from "@/lib/predictfun/parsePredictFunModalApi";

export function usePredictFunMarketMatches(
  marketId: string | null,
  categorySlug: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: ["predictfun-market-matches", marketId, categorySlug],
    enabled: enabled && !!(marketId || categorySlug),
    queryFn: async (): Promise<PredictFunActivityItem[]> => {
      const params = new URLSearchParams({ first: "40" });
      if (marketId) params.set("marketId", marketId);
      else if (categorySlug) params.set("categorySlug", categorySlug);

      const res = await fetch(`/api/predictfun/orders/matches?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load activity");
      }
      const json = await res.json();
      const list = extractPredictFunList(json);
      return list
        .flatMap((m, i) => mapPredictFunMatchToActivityItems(m, i))
        .sort((a, b) => b.sortTime - a.sortTime);
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

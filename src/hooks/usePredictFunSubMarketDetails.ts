"use client";

import { useQuery } from "@tanstack/react-query";
import type { PredictFunApiMarket } from "@/lib/predictfun/mapPredictFunMarketRow";

/** Fetch full GET /markets/:id payload for a category child (outcomes, onChainId, bid/ask). */
export function usePredictFunSubMarketDetails(
  marketId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: ["predictfun-submarket-details", marketId],
    enabled: enabled && !!marketId,
    queryFn: async (): Promise<PredictFunApiMarket | null> => {
      const res = await fetch(
        `/api/predictfun/market-details?id=${encodeURIComponent(marketId!)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const raw = json?.rawEventData as PredictFunApiMarket | undefined;
      if (raw && typeof raw === "object" && !Array.isArray((raw as { childMarkets?: unknown }).childMarkets)) {
        return raw;
      }
      const nested = json?.data as PredictFunApiMarket | undefined;
      return nested && typeof nested === "object" ? nested : null;
    },
    staleTime: 15_000,
  });
}

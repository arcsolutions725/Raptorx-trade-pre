"use client";

import { useQuery } from "@tanstack/react-query";
import {
  extractPredictFunTimeseriesSeries,
  getPredictFunTimeseriesRange,
  type PredictFunChartTimeframeKey,
  type PredictFunTimeseriesPoint,
} from "@/lib/predictfun/parsePriceChart";

export function usePredictFunTimeseries(
  marketId: string | null,
  timeframe: PredictFunChartTimeframeKey,
  enabled = true
) {
  const { resolution, fromSec, toSec, limit } = getPredictFunTimeseriesRange(timeframe);

  const query = useQuery({
    queryKey: [
      "predictfun-timeseries",
      marketId,
      timeframe,
      resolution,
      fromSec,
      toSec,
    ],
    enabled: enabled && !!marketId,
    queryFn: async (): Promise<PredictFunTimeseriesPoint[]> => {
      const params = new URLSearchParams({
        id: marketId!,
        metric: "chance",
        resolution,
        from: String(fromSec),
        to: String(toSec),
        limit: String(limit),
      });
      const res = await fetch(`/api/predictfun/timeseries?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Timeseries fetch failed");
      }
      const json = await res.json();
      return extractPredictFunTimeseriesSeries(json);
    },
    staleTime: 30_000,
  });

  return {
    series: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
  };
}

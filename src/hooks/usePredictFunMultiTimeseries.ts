"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  buildPredictFunMultiChart,
  extractPredictFunTimeseriesSeries,
  getPredictFunTimeseriesRange,
  type PredictFunChartTimeframeKey,
  type PredictFunTimeseriesPoint,
} from "@/lib/predictfun/parsePriceChart";

export type PredictFunChartMarketRef = {
  id: string;
  title: string;
};

async function fetchPredictFunSeries(
  marketId: string,
  timeframe: PredictFunChartTimeframeKey
): Promise<PredictFunTimeseriesPoint[]> {
  const { resolution, fromSec, toSec, limit } = getPredictFunTimeseriesRange(timeframe);
  const params = new URLSearchParams({
    id: marketId,
    metric: "chance",
    resolution,
    from: String(fromSec),
    to: String(toSec),
    limit: String(limit),
  });
  const res = await fetch(`/api/predictfun/timeseries?${params}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Timeseries fetch failed");
  }
  const json = await res.json();
  return extractPredictFunTimeseriesSeries(json);
}

/** Fetch and merge timeseries for multiple sub-markets (e.g. top 3 outcomes). */
export function usePredictFunMultiTimeseries(
  markets: PredictFunChartMarketRef[],
  timeframe: PredictFunChartTimeframeKey,
  enabled = true
) {
  const { resolution, fromSec, toSec } = getPredictFunTimeseriesRange(timeframe);

  const queries = useQueries({
    queries: markets.map((m) => ({
      queryKey: [
        "predictfun-timeseries",
        m.id,
        m.title,
        timeframe,
        resolution,
        fromSec,
        toSec,
      ],
      enabled: enabled && !!m.id,
      queryFn: async (): Promise<{ title: string; series: PredictFunTimeseriesPoint[] }> => {
        const series = await fetchPredictFunSeries(m.id, timeframe);
        return { title: m.title, series };
      },
      staleTime: 30_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);

  const { chartData, marketKeys } = useMemo(() => {
    const entries = queries
      .map((q) => q.data)
      .filter(
        (d): d is { title: string; series: PredictFunTimeseriesPoint[] } =>
          !!d && Array.isArray(d.series) && d.series.length > 0
      );
    return buildPredictFunMultiChart(entries, timeframe);
  }, [queries, timeframe]);

  return {
    chartData,
    marketKeys,
    isLoading,
    isFetching,
    isError: queries.some((q) => q.isError),
  };
}

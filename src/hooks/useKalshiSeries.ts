"use client";

import { useQuery } from "@tanstack/react-query";

export type KalshiSeries = {
  ticker: string;
  frequency: string;
  title: string;
  category: string;
  tags: string[];
  settlement_sources: Array<{
    name: string;
    url: string;
  }>;
  contract_url: string;
  contract_terms_url: string;
  product_metadata?: Record<string, unknown>;
  fee_type: "quadratic" | "quadratic_with_maker_fees" | "flat";
  fee_multiplier: number;
  additional_prohibitions: string[];
};

export type KalshiSeriesResponse = {
  series: KalshiSeries[];
};

export type SeriesFilters = {
  status?: string;
};

export function useKalshiSeries(filters?: SeriesFilters) {
  const query = useQuery({
    queryKey: ["kalshi-series", filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters?.status) {
        params.append("status", filters.status);
      }

      const url = `/api/kalshi/series${params.toString() ? `?${params.toString()}` : ""}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "force-cache",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `Failed to fetch series: ${res.statusText}`);
      }

      return res.json() as Promise<KalshiSeriesResponse>;
    },
    staleTime: 1000 * 60 * 30,
  });

  return {
    series: query.data?.series || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

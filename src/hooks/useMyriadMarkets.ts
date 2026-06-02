/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { LimitlessMarket } from "@/hooks/useLimitlessMarkets";
import { mapMyriadApiMarketToRow } from "@/lib/myriad/mapMyriadMarketRow";

export type MyriadMarketRow = LimitlessMarket & { _source: "myriad"; slug: string };

/**
 * @param topicDisplay Capitalized topic for `topics` query (e.g. Crypto, Sports), or null for all.
 */
export function useMyriadMarkets(
  topicDisplay: string | null = null,
  searchQuery: string | null = null,
  enabled: boolean = true
) {
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(1);

  useEffect(() => {
    setPageIndex(1);
  }, [searchQuery, topicDisplay]);

  const query = useQuery({
    queryKey: ["myriad-markets", topicDisplay, searchQuery, pageSize, pageIndex],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: pageIndex.toString(),
        limit: pageSize.toString(),
        sort: "volume_24h",
        order: "desc",
        state: "open",
        trading_model: "all",
      });
      const q = searchQuery?.trim();
      if (q) {
        params.set("keyword", q);
      } else if (
        topicDisplay?.trim() &&
        topicDisplay.trim().toLowerCase() !== "all"
      ) {
        params.set("topics", topicDisplay.trim());
      }

      const res = await fetch(`/api/myriad/markets?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `Myriad fetch failed: ${res.status}`);
      }
      return res.json();
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const markets = useMemo(() => {
    const data = query.data as any;
    if (!data || !Array.isArray(data.data)) {
      return [];
    }
    return (data.data as any[]).map((m) =>
      mapMyriadApiMarketToRow(m)
    ) as MyriadMarketRow[];
  }, [query.data]);

  const pagination = useMemo(() => {
    const data = query.data as any;
    return data?.pagination as
      | {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasNext: boolean;
          hasPrev: boolean;
        }
      | undefined;
  }, [query.data]);

  const totalPages = pagination?.totalPages;
  const hasNext = pagination?.hasNext ?? false;
  const hasPrev = pagination?.hasPrev ?? pageIndex > 1;

  const nextPage = () => {
    if (hasNext) setPageIndex((prev) => prev + 1);
  };

  const prevPage = () => {
    if (hasPrev) setPageIndex((prev) => prev - 1);
  };

  return {
    markets,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    isFetching: query.isFetching,
    pageIndex,
    pageSize,
    totalPages,
    hasPrev,
    hasNext,
    nextPage,
    prevPage,
    setPageIndex,
    setPageSize,
    isPageLoading: query.isFetching && !query.isPlaceholderData,
  };
}

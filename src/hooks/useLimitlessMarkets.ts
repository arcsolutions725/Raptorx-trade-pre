/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

export type LimitlessMarket = {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  image?: string;
  icon?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  volume: number;
  volume24hr: number;
  /** Pre-formatted volume string from API (e.g. "$1.2M") for display when volume24hr is 0 */
  volumeFormatted?: string;
  liquidity: number;
  markets: any[];
  yesPrice: string | number;
  noPrice: string | number;
  choiceI: string | number;
  choiceII: string | number;
  rawEventData?: any;
};

/** Tag filter for category markets: { [paramKey]: paramValue } e.g. { duration: "hourly" } */
export type LimitlessTagFilter = Record<string, string> | null;

export function useLimitlessMarkets(
  categoryId: string | null = null,
  tagFilter: LimitlessTagFilter = null,
  searchQuery: string | null = null,
  enabled: boolean = true
) {
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(1);

  // Reset page index when search query, category, or tag filter changes
  useEffect(() => {
    setPageIndex(1);
  }, [searchQuery, categoryId, tagFilter]);

  const query = useQuery({
    queryKey: ["limitless-markets", categoryId, tagFilter, searchQuery, pageSize, pageIndex],
    enabled,
    queryFn: async () => {
      // When a category is selected, use market-pages/{categoryId}/markets
      if (categoryId && categoryId.trim()) {
        const params = new URLSearchParams({
          categoryId: categoryId.trim(),
          page: pageIndex.toString(),
          limit: pageSize.toString(),
          sort: "deadline",
        });
        if (tagFilter && typeof tagFilter === "object") {
          Object.entries(tagFilter).forEach(([key, value]) => {
            if (key && value) params.set(key, value);
          });
        }
        const res = await fetch(`/api/limitless/markets-by-category?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errorData.error || `Limitless category fetch failed: ${res.status}`);
        }
        return res.json();
      }

      // No category: use /markets/active
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        page: pageIndex.toString(),
      });
      if (searchQuery && searchQuery.trim()) {
        params.append("q", searchQuery.trim());
      }
      const res = await fetch(`/api/limitless/markets?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `Limitless fetch failed: ${res.statusText}`);
      }
      return res.json();
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const markets = useMemo(() => {
    const data = query.data as any;
    if (!data || !Array.isArray(data.markets)) {
      return [];
    }
    return data.markets as LimitlessMarket[];
  }, [query.data]);

  const totalCount = useMemo(() => {
    const data = query.data as any;
    return data?.count || 0;
  }, [query.data]);

  const hasMore = useMemo(() => {
    const data = query.data as any;
    return data?.hasMore;
  }, [query.data]);

  const totalPages = useMemo(() => {
    // If we have a total count, calculate pages from it
    if (totalCount > 0) {
      return Math.ceil(totalCount / pageSize);
    }
    // If we don't have a total count, we can't calculate exact pages
    // Return undefined to indicate unknown total pages
    return undefined;
  }, [totalCount, pageSize]);

  const hasNext = useMemo(() => {
    // Use hasMore from API response - this is the primary source of truth
    if (hasMore !== undefined) {
      return hasMore;
    }
    // Fallback: if we have totalPages, use that
    if (totalPages !== undefined && totalPages > 0) {
      return pageIndex < totalPages;
    }
    // Last fallback: if we have markets and they match pageSize, assume there might be more
    return markets.length >= pageSize;
  }, [hasMore, totalPages, pageIndex, markets.length, pageSize]);

  const hasPrev = useMemo(() => {
    return pageIndex > 1;
  }, [pageIndex]);

  const nextPage = () => {
    if (hasNext) {
      setPageIndex((prev) => prev + 1);
    }
  };

  const prevPage = () => {
    if (hasPrev) {
      setPageIndex((prev) => prev - 1);
    }
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
    totalCount,
    hasPrev,
    hasNext,
    nextPage,
    prevPage,
    setPageIndex,
    setPageSize,
    isPageLoading: query.isFetching && !query.isPlaceholderData,
  };
}

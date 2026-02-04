/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

export type PolymarketMarket = {
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
  liquidity: number;
  markets: any[];
  yesPrice: string | number;
  noPrice: string | number;
  choiceI: string | number;
  choiceII: string | number;
  rawEventData?: any;
};

export function usePolymarketMarkets(
  category: string | null = null,
  tag: string | null = null,
  searchQuery: string | null = null,
  enabled: boolean = true
) {
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(1);

  const offset = useMemo(() => {
    return (pageIndex - 1) * pageSize;
  }, [pageIndex, pageSize]);

  // Reset page index when search query, category, or tag changes
  useEffect(() => {
    setPageIndex(1);
  }, [searchQuery, category, tag]);

  const query = useQuery({
    queryKey: ["polymarket-markets", category, tag, searchQuery, pageSize, offset],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        active: "true",
        archived: "false",
        closed: "false",
        order: "volume24hr",
        ascending: "false",
        offset: offset.toString(),
      });

      // If a search query is provided, use it (search takes precedence over tag/category)
      if (searchQuery && searchQuery.trim()) {
        params.append("q", searchQuery.trim());
      } else {
        // If a tag is selected, use it for filtering (tag takes precedence over category)
        if (tag) {
          params.append("tag_slug", tag);
        } else if (category && category !== "all") {
          // Use the category as tag_slug (should be lowercase slug format)
          const categorySlug = category.toLowerCase().replace(/\s+/g, "-");
          params.append("tag_slug", categorySlug);
        }
      }

      const res = await fetch(`/api/polymarket/markets?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `Polymarket fetch failed: ${res.statusText}`);
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
    return data.markets as PolymarketMarket[];
  }, [query.data]);

  const totalCount = useMemo(() => {
    const data = query.data as any;
    return data?.count || 0;
  }, [query.data]);

  const hasMore = useMemo(() => {
    const data = query.data as any;
    // Check if hasMore exists in the response (could be true, false, or undefined)
    // According to Polymarket Events API docs, /events endpoint returns array directly
    // Our API route determines hasMore by checking if returned items === limit
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
    // The API route determines hasMore by checking if returned items === requested limit
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

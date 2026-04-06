/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export type KalashiMarketMarket = {
  ticker: string;
  yes_subtitle: string;
  no_subtitle: string;
  yes_bid: number;
  yes_ask: number;
  last_price: number;
  yes_bid_dollars: number;
  yes_ask_dollars: number;
  last_price_dollars: number;
  volume: number;
  volume_24h: number;
  score: number;
  custom_strike?: any;
};

export type KalashiMarket = {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle?: string;
  open_time: string;
  close_time: string;
  expected_expiration_time: string;
  latest_expiration_time?: string;
  status: string;
  result?: string;
  volume?: number;
  volume_24h?: number;
  liquidity?: number;
  open_interest?: number;
  strike_type?: string;
  yes_ask?: number;
  yes_bid?: number;
  no_ask?: number;
  no_bid?: number;
  yes_price?: number;
  no_price?: number;
  underlying?: string;
  category?: string;
  ranged_group_name?: string;
  series_ticker?: string;
  symbol_image_url?: string;
  markets?: KalashiMarketMarket[];
  rawMarketData?: any;
  rawSeriesData?: any;
};

export type CategoryType =
  | "all"
  | "politics"
  | "sports"
  | "finance"
  | "crypto"
  | "economics"
  | "climate"
  | "entertainment";

export function useKalashiMarkets(
  category: CategoryType | string = "all", 
  tag: string | null = null,
  searchQuery: string | null = null,
  enabled: boolean = true
) {
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(1);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  // Get cursor for current page - use history if going back, otherwise undefined for first page
  const cursor = useMemo(() => {
    if (pageIndex === 1) return undefined;
    // For cursor-based pagination, we need to track cursor history
    // For now, we'll use the cursor from previous response
    return cursorHistory[pageIndex - 2] || undefined;
  }, [pageIndex, cursorHistory]);

  const query = useQuery({
    queryKey: ["kalashi-markets", category, tag, searchQuery, pageSize, cursor],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        status: "open",
      });

      if (cursor) {
        params.append("cursor", cursor);
      }

      // Add search query if provided (search takes priority over category/tag)
      if (searchQuery) {
        params.append("query", searchQuery);
      } else {
        // Only add category/tag filters if not searching
        if (category !== "all") {
          params.append("category", category);
        }

        if (tag) {
          params.append("tag", tag);
        }
      }

      const res = await fetch(`/api/kalshi/markets?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `Kalashi fetch failed: ${res.statusText}`);
      }

      return res.json();
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const markets = useMemo(() => {
    const data = query.data as any;
    if (!data?.markets || !Array.isArray(data.markets)) return [];
    return data.markets as KalashiMarket[];
  }, [query.data]);

  const total = useMemo(() => {
    const data = query.data as any;
    return typeof data?.count === "number" ? data.count : undefined;
  }, [query.data]);

  const totalPages = useMemo(() => {
    if (!total || pageSize <= 0) return undefined;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  const currentCursor = useMemo(() => {
    const data = query.data as any;
    return data?.cursor || undefined;
  }, [query.data]);

  const hasNextCursor = useMemo(() => {
    return Boolean(currentCursor);
  }, [currentCursor]);

  const isPageLoading = query.isFetching && query.isPlaceholderData;

  const hasPrev = pageIndex > 1;
  const hasNext = hasNextCursor;

  const nextPage = useCallback(() => {
    if (hasNext && currentCursor) {
      // Add current cursor to history before moving forward
      setCursorHistory((prev) => {
        const newHistory = [...prev];
        // Only keep history up to current page
        newHistory[pageIndex - 1] = currentCursor;
        return newHistory.slice(0, pageIndex);
      });
      setPageIndex((p) => p + 1);
    }
  }, [hasNext, currentCursor, pageIndex]);

  const prevPage = useCallback(() => {
    if (hasPrev) {
      setPageIndex((p) => Math.max(1, p - 1));
    }
  }, [hasPrev]);

  const setSize = useCallback((n: number) => {
    setPageSize(n);
    setPageIndex(1);
    setCursorHistory([]);
  }, []);

  const goToPage = useCallback((p: number) => {
    const newPage = Math.max(1, Number.isFinite(p) ? Math.floor(p) : 1);
    setPageIndex(newPage);
    // Reset cursor history if going to page 1
    if (newPage === 1) {
      setCursorHistory([]);
    }
  }, []);

  // Reset cursor history when category, tag, or search query changes
  const prevCategoryRef = useRef(category);
  const prevTagRef = useRef(tag);
  const prevSearchQueryRef = useRef(searchQuery);
  useEffect(() => {
    if (
      prevCategoryRef.current !== category || 
      prevTagRef.current !== tag ||
      prevSearchQueryRef.current !== searchQuery
    ) {
      setCursorHistory([]);
      setPageIndex(1);
      prevCategoryRef.current = category;
      prevTagRef.current = tag;
      prevSearchQueryRef.current = searchQuery;
    }
  }, [category, tag, searchQuery]);

  return {
    markets,
    total,
    totalPages,

    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    isFetching: query.isFetching,
    isPageLoading,

    pageIndex,
    pageSize,
    hasPrev,
    hasNext,
    nextPage,
    prevPage,
    setPageIndex: goToPage,
    setPageSize: setSize,
  };
}

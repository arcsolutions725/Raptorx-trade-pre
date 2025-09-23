/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export type TrendingToken = {
  chainId?: string;
  tokenAddress?: string;
  name?: string;
  uniqueName?: string | null;
  symbol?: string;
  decimals?: number;
  logo?: string;
  usdPrice?: number;
  createdAt?: number;
  lastTradeUnixTime?: number;
  marketCap?: number;
  liquidityUsd?: number;
  holders?: number;
  pricePercentChange?: {
    "1h"?: number;
    "4h"?: number;
    "12h"?: number;
    "24h"?: number;
  };
  totalVolume?: {
    "1h"?: number;
    "4h"?: number;
    "12h"?: number;
    "24h"?: number;
  };
  transactions?: Record<string, number>;
  buyTransactions?: Record<string, number>;
  sellTransactions?: Record<string, number>;
  buyers?: Record<string, number>;
  sellers?: Record<string, number>;
  _rank?: number;
};

export type SortField = "marketCap" | "volume" | "price" | "age" | "liquidity";
export type SortDirection = "asc" | "desc" | null;

function normalizeArray(payload: unknown): TrendingToken[] {
  const p = payload as any;
  if (Array.isArray(p?.items))
    return p.items.filter((x: any) => x && typeof x === "object");
  if (Array.isArray(p?.result))
    return p.result.filter((x: any) => x && typeof x === "object");
  if (Array.isArray(payload))
    return (payload as any[]).filter((x) => x && typeof x === "object");
  return [];
}

function getVolumeValue(t: any) {
  const v = t.totalVolume;
  return v?.["24h"] ?? v?.["12h"] ?? v?.["4h"] ?? v?.["1h"] ?? 0;
}
function getAgeInSecondsStrict(t: any) {
  const sec = typeof t?.createdAt === "number" ? t.createdAt : undefined;
  if (!sec) return undefined;
  return Math.max(0, Math.floor(Date.now() / 1000) - sec);
}

function sortTokens(
  tokens: any[],
  field: SortField | null,
  dir: SortDirection
) {
  if (!field || !dir) return tokens;
  return [...tokens].sort((a, b) => {
    let A = 0,
      B = 0;
    if (field === "marketCap") {
      A = a.marketCap ?? 0;
      B = b.marketCap ?? 0;
    } else if (field === "volume") {
      A = getVolumeValue(a);
      B = getVolumeValue(b);
    } else if (field === "price") {
      A = a.usdPrice ?? 0;
      B = b.usdPrice ?? 0;
    } else if (field === "age") {
      const aAge = getAgeInSecondsStrict(a);
      const bAge = getAgeInSecondsStrict(b);
      if (aAge === undefined && bAge === undefined) return 0;
      if (aAge === undefined) return 1;
      if (bAge === undefined) return -1;
      A = aAge;
      B = bAge;
    } else if (field === "liquidity") {
      A = a.liquidityUsd ?? 0;
      B = b.liquidityUsd ?? 0;
    }
    return dir === "asc" ? A - B : B - A;
  });
}

export function useTrendingTokens(
  customBody?: Partial<{
    chain: string;
    sort_by: string;
    sort_type: "asc" | "desc";
    min_liquidity: number;
    ui_amount_mode: "raw" | "scaled";
    verified_only: boolean;
    force_full_scan: boolean; // <- allow external control if desired
  }>
) {
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(1); // 1-based
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Local toggle for requesting an exact verified total (forces full upstream scan)
  const [forceFullScan, setForceFullScan] = useState<boolean>(
    customBody?.force_full_scan ?? false
  );

  const offset = (pageIndex - 1) * pageSize;

  const query = useQuery({
    queryKey: [
      "trending",
      customBody ?? {},
      pageSize,
      pageIndex,
      sortField,
      sortDirection,
      forceFullScan, // re-fetch when toggled
    ],
    queryFn: async () => {
      const res = await fetch("/api/trending", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          limit: pageSize,
          offset,
          chain: "solana",
          sort_by: "v24hUSD",
          sort_type: "desc",
          min_liquidity: 100,
          ui_amount_mode: "scaled",
          verified_only: true,
          force_full_scan: forceFullScan,
          ...(customBody ?? {}),
        }),
      });
      if (!res.ok) throw new Error(`Trending fetch failed: ${res.statusText}`);
      return res.json();
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const rawItems = useMemo(() => normalizeArray(query.data), [query.data]);
  const upstreamTotal = (query.data as any)?.upstreamTotal as
    | number
    | undefined;
  const filteredTotal = (query.data as any)?.filteredTotal as
    | number
    | undefined;
  const verifiedTotalExact = (query.data as any)?.verifiedTotal as
    | number
    | null
    | undefined;
  const verifiedTotalLowerBound = (query.data as any)
    ?.verifiedTotalLowerBound as number | null | undefined;
  const jupVerifiedTotal = (query.data as any)?.jupVerifiedTotal as
    | number
    | undefined;
  const exhausted = Boolean((query.data as any)?.exhausted);

  // v5: show overlay while fetching with previous data still on screen
  const isPageLoading = query.isFetching && query.isPlaceholderData;

  const sortedData = useMemo(
    () => sortTokens(rawItems, sortField, sortDirection),
    [rawItems, sortField, sortDirection]
  );

  const itemsWithRank = useMemo(
    () =>
      sortedData.map((row, i) => ({
        ...row,
        _rank: (pageIndex - 1) * pageSize + i + 1,
      })),
    [sortedData, pageIndex, pageSize]
  );

  // Prefer exact verified total if available; else fallback to filteredTotal when provided.
  const total =
    typeof verifiedTotalExact === "number"
      ? verifiedTotalExact
      : typeof filteredTotal === "number"
      ? filteredTotal
      : undefined;

  const totalPages =
    typeof total === "number" && pageSize > 0
      ? Math.max(1, Math.ceil(total / pageSize))
      : undefined;

  const hasPrev = pageIndex > 1;
  let hasNext: boolean;
  if (typeof total === "number") {
    hasNext = pageIndex * pageSize < total;
  } else {
    hasNext = itemsWithRank.length >= pageSize && !exhausted;
  }

  const nextPage = useCallback(() => {
    if (hasNext) setPageIndex((p) => p + 1);
  }, [hasNext]);

  const prevPage = useCallback(() => {
    if (hasPrev) setPageIndex((p) => Math.max(1, p - 1));
  }, [hasPrev]);

  const setSize = useCallback((n: number) => {
    setPageSize(n);
    setPageIndex(1);
  }, []);

  const goToPage = useCallback((p: number) => {
    setPageIndex(Math.max(1, Number.isFinite(p) ? Math.floor(p) : 1));
  }, []);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        if (sortDirection === "desc") setSortDirection("asc");
        else if (sortDirection === "asc") {
          setSortField(null);
          setSortDirection(null);
        } else setSortDirection("desc");
      } else {
        setSortField(field);
        setSortDirection("desc");
      }
    },
    [sortField, sortDirection]
  );

  return {
    data: itemsWithRank,

    // totals
    total, // preferred total for pagination
    upstreamTotal, // Birdeye unfiltered
    verifiedTotal: verifiedTotalExact ?? undefined,
    verifiedTotalLowerBound: verifiedTotalLowerBound ?? undefined,
    jupVerifiedTotal, // global Jupiter verified count
    totalPages,

    // query state
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    isFetching: query.isFetching,

    // page transition indicator
    isPageLoading,

    // pagination
    pageIndex,
    pageSize,
    hasPrev,
    hasNext,
    nextPage,
    prevPage,
    setPageIndex: goToPage,
    setPageSize: setSize,

    // sorting
    sortField,
    sortDirection,
    onSort: handleSort,

    // full-scan toggle
    forceFullScan,
    setForceFullScan,
  };
}

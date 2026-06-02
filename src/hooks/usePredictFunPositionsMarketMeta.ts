"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { extractPredictFunPositionsList } from "@/lib/predictfun/parsePredictFunPositions";

async function fetchPredictFunMarketMeta(
  marketId: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `/api/predictfun/market-details?id=${encodeURIComponent(marketId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const raw = json?.rawEventData ?? json?.data;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/** Fetches full market metadata for each position row (resolved status, winning outcome). */
export function usePredictFunPositionsMarketMeta(
  positionsBody: unknown,
  enabled: boolean
) {
  const marketIds = useMemo(() => {
    const list = extractPredictFunPositionsList(positionsBody);
    const ids = new Set<string>();
    for (const p of list) {
      const id = String(p?.market?.id ?? p?.marketId ?? p?.market_id ?? "").trim();
      if (/^\d+$/.test(id)) ids.add(id);
    }
    return [...ids].slice(0, 25);
  }, [positionsBody]);

  const queries = useQueries({
    queries: marketIds.map((id) => ({
      queryKey: ["predictfun-position-market-meta", id],
      enabled: enabled && !!id,
      queryFn: () => fetchPredictFunMarketMeta(id),
      staleTime: 60_000,
    })),
  });

  const marketById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    marketIds.forEach((id, i) => {
      const data = queries[i]?.data;
      if (data) map.set(id, data);
    });
    return map;
  }, [marketIds, queries]);

  const isLoading = queries.some((q) => q.isLoading || q.isFetching);

  return { marketById, isLoading, marketIds };
}

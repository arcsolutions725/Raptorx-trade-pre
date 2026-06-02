"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { chainFromToken } from "@/lib/rexscreenerRoutes";

const EMPTY_SERIES: Record<string, number[]> = {};

export function trendSparklineCacheKey(t: TrendingToken): string {
  const addr = (t.tokenAddress || "").trim();
  if (!addr) return "";
  const chain = chainFromToken(t);
  if (chain === "solana") return `solana:${addr}`;
  return `${chain}:${addr.toLowerCase()}`;
}

export function useTrendingSparklines(rows: TrendingToken[]) {
  const tokens = useMemo(() => {
    const out: { chain: string; address: string }[] = [];
    const seen = new Set<string>();
    const max = 25;
    for (const t of rows) {
      if (out.length >= max) break;
      const raw = t.tokenAddress?.trim();
      if (!raw) continue;
      const chain = chainFromToken(t);
      const k =
        chain === "solana" ? `solana:${raw}` : `${chain}:${raw.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        chain,
        address: chain === "solana" ? raw : raw.toLowerCase(),
      });
    }
    return out;
  }, [rows]);

  const requestKey = useMemo(
    () =>
      tokens
        .map((x) =>
          x.chain === "solana"
            ? `solana:${x.address}`
            : `${x.chain}:${x.address.toLowerCase()}`
        )
        .sort()
        .join("|"),
    [tokens]
  );

  const query = useQuery({
    queryKey: ["trending-sparklines", requestKey],
    queryFn: async () => {
      const res = await fetch("/api/trending/sparklines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ tokens }),
      });
      if (!res.ok) return { series: {} as Record<string, number[]> };
      return res.json() as Promise<{ series: Record<string, number[]> }>;
    },
    enabled: tokens.length > 0 && requestKey.length > 0,
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });

  return {
    series: query.data?.series ?? EMPTY_SERIES,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}

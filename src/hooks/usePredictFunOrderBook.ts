/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useQuery } from "@tanstack/react-query";

export type PredictFunOrderBook = {
  marketId: number;
  updateTimestampMs: number;
  asks: [number, number][];
  bids: [number, number][];
  lastOrderSettled?: {
    id: string;
    price: string;
    kind: string;
    marketId: number;
    side: "Ask" | "Bid";
    outcome: "Yes" | "No";
  };
};

export function usePredictFunOrderBook(marketId: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ["predictfun-orderbook", marketId],
    enabled: enabled && !!marketId,
    queryFn: async () => {
      const res = await fetch(
        `/api/predictfun/orderbook?id=${encodeURIComponent(marketId!)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Orderbook fetch failed");
      }
      const json = await res.json();
      return (json?.data ?? json) as PredictFunOrderBook;
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  return {
    orderbook: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

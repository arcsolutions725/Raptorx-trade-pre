"use client";

import { useQuery } from "@tanstack/react-query";

export type LimitlessOrderBookEntry = {
  price: number;
  size: number;
  side: "BUY" | "SELL";
};

export type LimitlessOrderBookResponse = {
  bids: LimitlessOrderBookEntry[];
  asks: LimitlessOrderBookEntry[];
  tokenId?: string;
  adjustedMidpoint?: number;
  midpoint?: number;
  maxSpread?: string;
  minSize?: string;
  lastTradePrice?: number;
};

export function useLimitlessOrderBook(marketSlug: string | null) {
  return useQuery({
    queryKey: ["limitless-orderbook", marketSlug],
    queryFn: async (): Promise<LimitlessOrderBookResponse | null> => {
      if (!marketSlug) return null;
      const res = await fetch(
        `/api/limitless/orderbook?slug=${encodeURIComponent(marketSlug)}`
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Limitless orderbook: ${res.status} ${err}`);
      }
      return res.json();
    },
    enabled: !!marketSlug,
    // Poll frequently so prices/buttons stay in sync with Limitless
    refetchInterval: 1000,
  });
}

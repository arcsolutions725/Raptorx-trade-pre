"use client";

import { useQuery } from "@tanstack/react-query";

export type MyriadOrderBookLevel = { price: number; size: number };

export type MyriadOrderBookData = {
  bids: MyriadOrderBookLevel[];
  asks: MyriadOrderBookLevel[];
  error?: string;
};

const WAD = 1e18;

function parseLevels(tuples: unknown): MyriadOrderBookLevel[] {
  if (!Array.isArray(tuples)) return [];
  const out: MyriadOrderBookLevel[] = [];
  for (const row of tuples) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const p = Number(row[0]) / WAD;
    const s = Number(row[1]) / WAD;
    if (!Number.isFinite(p) || !Number.isFinite(s)) continue;
    out.push({ price: p, size: s });
  }
  return out;
}

export function useMyriadOrderBook(
  marketId: number | null,
  networkId: number | null,
  outcomeIndex: number,
  enabled = true
) {
  return useQuery({
    queryKey: ["myriad-orderbook", marketId, networkId, outcomeIndex],
    enabled: enabled && marketId != null && networkId != null && networkId > 0,
    staleTime: 5_000,
    queryFn: async (): Promise<MyriadOrderBookData> => {
      const params = new URLSearchParams({
        market_id: String(marketId),
        network_id: String(networkId),
        outcome: String(outcomeIndex),
      });
      const res = await fetch(`/api/myriad/orderbook?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          bids: [],
          asks: [],
          error: typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
        };
      }
      return {
        bids: parseLevels(json.bids),
        asks: parseLevels(json.asks),
      };
    },
  });
}

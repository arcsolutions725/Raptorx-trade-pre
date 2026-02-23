"use client";

import { useQuery } from "@tanstack/react-query";

const COINGECKO_SOL_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

export type SolPriceResult = number | null;

/**
 * Fetches current SOL/USD price from CoinGecko (no API key for simple price).
 */
export function useSolPrice(enabled = true) {
  return useQuery({
    queryKey: ["sol-price-usd"],
    queryFn: async (): Promise<number> => {
      const res = await fetch(COINGECKO_SOL_PRICE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch SOL price");
      const data = (await res.json()) as { solana?: { usd?: number } };
      const price = data.solana?.usd;
      if (price == null || price <= 0) throw new Error("Invalid SOL price");
      return price;
    },
    enabled,
    staleTime: 60_000,
  });
}

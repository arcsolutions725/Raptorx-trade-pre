import { useQuery } from "@tanstack/react-query";
import type { OrderBookEntry } from "@/types/polymarketTrading";

export function useOrderBook(clobTokenId: string | null) {
  return useQuery({
    queryKey: ["polymarket-orderbook", clobTokenId],
    queryFn: async () => {
      if (!clobTokenId) return null;
      const res = await fetch(
        `/api/polymarket/orderbook?clob_token_id=${encodeURIComponent(clobTokenId)}`
      );
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Order book fetch error:", errorText);
        throw new Error(
          `Failed to fetch order book: ${res.status} ${errorText}`
        );
      }
      const data = await res.json();
      return data;
    },
    enabled: !!clobTokenId,
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}


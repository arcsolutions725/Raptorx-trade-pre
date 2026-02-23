import { useQuery } from "@tanstack/react-query";
import type { OrderBookEntry } from "@/types/polymarketTrading";

type KalshiOrderBookResponse = {
  yes: {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
  };
  no: {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
  };
  sequence?: number | null;
};

export function useKalshiOrderBook(
  marketTicker: string | null,
  selectedOutcome: "Yes" | "No" = "Yes"
) {
  return useQuery({
    queryKey: ["kalshi-orderbook", marketTicker, selectedOutcome],
    queryFn: async () => {
      if (!marketTicker) return null;
      const res = await fetch(
        `/api/kalshi/orderbook?market_ticker=${encodeURIComponent(marketTicker)}`
      );
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Kalshi order book fetch error:", errorText);
        throw new Error(
          `Failed to fetch order book: ${res.status} ${errorText}`
        );
      }
      const data = (await res.json()) as KalshiOrderBookResponse;
      
      // Return the appropriate bids/asks based on selected outcome
      if (selectedOutcome === "Yes") {
        return {
          bids: data.yes?.bids || [],
          asks: data.yes?.asks || [],
        } as { bids: OrderBookEntry[]; asks: OrderBookEntry[] };
      } else {
        return {
          bids: data.no?.bids || [],
          asks: data.no?.asks || [],
        } as { bids: OrderBookEntry[]; asks: OrderBookEntry[] };
      }
    },
    enabled: !!marketTicker,
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

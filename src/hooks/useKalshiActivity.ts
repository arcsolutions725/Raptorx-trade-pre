import { useQuery } from "@tanstack/react-query";

export type KalshiTrade = {
  trade_id: string;
  market_id: string;
  ticker: string;
  price: number;
  price_dollars: string;
  count: number;
  taker_side: "yes" | "no";
  maker_action: "buy" | "sell";
  taker_action: "buy" | "sell";
  maker_nickname: string;
  taker_nickname: string;
  maker_social_id: string;
  taker_social_id: string;
  create_date: string;
};

type UseKalshiActivityParams = {
  seriesTicker?: string;
  pageSize?: number;
};

export function useKalshiActivity({
  seriesTicker,
  pageSize = 20,
}: UseKalshiActivityParams) {
  return useQuery({
    queryKey: ["kalshi-activity", seriesTicker, pageSize],
    queryFn: async () => {
      if (!seriesTicker) return null;

      const params = new URLSearchParams({
        series_ticker: seriesTicker,
        page_size: pageSize.toString(),
      });

      const res = await fetch(
        `/api/kalshi/activity?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Kalshi activity fetch error:", errorText);
        throw new Error(`Failed to fetch activity: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      return data as { trades: KalshiTrade[]; cursor?: string };
    },
    enabled: !!seriesTicker,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

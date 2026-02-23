import { useQuery } from "@tanstack/react-query";

export type KalshiPriceHistoryPoint = {
  ts: number;
  price: number;
  volume?: number;
};

type UseKalshiPriceHistoryParams = {
  seriesTicker?: string;
  marketId?: string;
  startTs?: number;
  endTs?: number;
  periodInterval?: number;
  candlestickFunction?: "mean_price" | "open_price" | "close_price" | "high_price" | "low_price";
};

export function useKalshiPriceHistory({
  seriesTicker,
  marketId,
  startTs,
  endTs,
  periodInterval = 60,
  candlestickFunction = "mean_price",
}: UseKalshiPriceHistoryParams) {
  return useQuery({
    queryKey: [
      "kalshi-price-history",
      seriesTicker,
      marketId,
      startTs,
      endTs,
      periodInterval,
      candlestickFunction,
    ],
    queryFn: async () => {
      if (!seriesTicker || !marketId) return null;

      const params = new URLSearchParams({
        series_ticker: seriesTicker,
        market_id: marketId,
        period_interval: periodInterval.toString(),
        candlestick_function: candlestickFunction,
      });

      if (startTs) {
        params.append("start_ts", startTs.toString());
      }
      if (endTs) {
        params.append("end_ts", endTs.toString());
      }

      const res = await fetch(
        `/api/kalshi/price-history?${params.toString()}`,
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
        console.error("Kalshi price history fetch error:", errorText);
        throw new Error(
          `Failed to fetch price history: ${res.status} ${errorText}`
        );
      }

      const data = await res.json();
      return data as { history: KalshiPriceHistoryPoint[] };
    },
    enabled: !!seriesTicker && !!marketId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

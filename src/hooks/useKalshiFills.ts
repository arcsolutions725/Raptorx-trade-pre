import { useQuery } from "@tanstack/react-query";

export type KalshiFill = {
  fill_id?: string;
  order_id?: string;
  ticker?: string;
  side?: "yes" | "no";
  action?: "buy" | "sell";
  count?: number;
  price?: number;
  is_taker?: boolean;
  created_time?: string;
};

type UseKalshiFillsParams = {
  /** Filter by market ticker. Omit for all fills. */
  ticker?: string;
  limit?: number;
  cursor?: string;
  enabled?: boolean;
};

export function useKalshiFills({
  ticker,
  limit = 50,
  cursor,
  enabled = true,
}: UseKalshiFillsParams = {}) {
  return useQuery({
    queryKey: ["kalshi-fills", ticker, limit, cursor],
    queryFn: async (): Promise<{ fills: KalshiFill[]; cursor?: string }> => {
      const params = new URLSearchParams();
      if (ticker) params.set("ticker", ticker);
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/kalshi/fills?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Kalshi fills fetch error:", errorText);
        throw new Error(`Failed to fetch fills: ${res.status} ${errorText}`);
      }

      const data = (await res.json()) as { fills?: KalshiFill[]; cursor?: string };
      return {
        fills: data.fills ?? [],
        cursor: data.cursor,
      };
    },
    enabled,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

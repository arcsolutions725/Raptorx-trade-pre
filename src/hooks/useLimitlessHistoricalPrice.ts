import { useQuery } from "@tanstack/react-query";

export type LimitlessPriceHistoryPoint = {
  ts: number;
  price: number;
};

export type LimitlessMarketHistory = {
  title: string;
  slug?: string;
  history: LimitlessPriceHistoryPoint[];
};

type UseLimitlessHistoricalPriceParams = {
  slug: string | null;
  interval?: string;
};

export function useLimitlessHistoricalPrice({
  slug,
  interval = "1W",
}: UseLimitlessHistoricalPriceParams) {
  return useQuery({
    queryKey: ["limitless-historical-price", slug, interval],
    queryFn: async () => {
      if (!slug) return { history: [], markets: [] as LimitlessMarketHistory[] };

      const params = new URLSearchParams({ slug, interval });
      const res = await fetch(`/api/limitless/historical-price?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Limitless historical price fetch error:", errorText);
        throw new Error(`Failed to fetch historical price: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      return data as {
        history: LimitlessPriceHistoryPoint[];
        markets?: LimitlessMarketHistory[];
      };
    },
    enabled: !!slug,
    refetchInterval: 30000,
  });
}

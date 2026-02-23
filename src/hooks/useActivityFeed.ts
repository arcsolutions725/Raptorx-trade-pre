import { useQuery } from "@tanstack/react-query";
import type { TradeActivity } from "@/types/polymarketTrading";

type UseActivityFeedParams = {
  conditionId: string | null;
  eventId?: string | null;
  marketFilter: string;
  priceFilter: string;
};

export function useActivityFeed({
  conditionId,
  eventId,
  marketFilter,
  priceFilter,
}: UseActivityFeedParams) {
  return useQuery({
    queryKey: ["polymarket-activity", marketFilter, eventId, priceFilter],
    queryFn: async () => {
      if (!eventId && marketFilter === "all" && !conditionId) return null;
      const params = new URLSearchParams({
        limit: "100",
        offset: "0",
        filterType: "CASH",
        filterAmount: priceFilter,
      });

      // Use market filter if specific market is selected, otherwise use eventId or conditionId
      if (marketFilter !== "all" && marketFilter) {
        params.append("market", marketFilter);
      } else if (eventId) {
        params.append("eventId", eventId);
      } else if (conditionId) {
        params.append("market", conditionId);
      }

      const res = await fetch(`/api/polymarket/activity?${params.toString()}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Activity fetch error:", errorText);
        throw new Error(`Failed to fetch activity: ${res.status} ${errorText}`);
      }
      const data = await res.json();
      return data;
    },
    enabled: !!(marketFilter !== "all" ? marketFilter : conditionId || eventId),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

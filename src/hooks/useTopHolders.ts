import { useQuery } from "@tanstack/react-query";
import type { TopHolder } from "@/types/polymarketTrading";

export function useTopHolders(conditionId: string | null) {
  return useQuery({
    queryKey: ["polymarket-top-holders", conditionId],
    queryFn: async () => {
      if (!conditionId) return null;
      const res = await fetch(
        `/api/polymarket/top-holders?market=${conditionId}&limit=20`
      );
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Top holders fetch error:", errorText);
        throw new Error(
          `Failed to fetch top holders: ${res.status} ${errorText}`
        );
      }
      const data = await res.json();
      return data;
    },
    enabled: !!conditionId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}


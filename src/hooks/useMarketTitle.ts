import { useQuery } from "@tanstack/react-query";
import type { ClobClient } from "@polymarket/clob-client";

// Cache for market titles to avoid repeated API calls
const marketTitleCache = new Map<string, string>();

export function useMarketTitle(
  clobClient: ClobClient | null,
  conditionId: string | undefined
) {
  return useQuery({
    queryKey: ["market-title", conditionId],
    queryFn: async (): Promise<string | null> => {
      if (!clobClient || !conditionId) {
        return null;
      }

      // Check cache first
      if (marketTitleCache.has(conditionId)) {
        return marketTitleCache.get(conditionId) || null;
      }

      try {
        const clobClientAny = clobClient as any;
        
        // Use getMarket method to fetch market details by condition ID
        // According to Polymarket docs, getMarket accepts condition ID
        const market = await clobClientAny.getMarket(conditionId);
        
        // Extract title from market response
        // Market response may have: question, groupItemTitle, subtitle, or title field
        const title = 
          market?.question || 
          market?.groupItemTitle || 
          market?.subtitle || 
          market?.title || 
          null;
        
        // Cache the result
        if (title) {
          marketTitleCache.set(conditionId, title);
        }
        
        return title || null;
      } catch (err) {
        console.warn(`Failed to fetch market title for ${conditionId}:`, err);
        return null;
      }
    },
    enabled: !!clobClient && !!conditionId,
    staleTime: 300_000, // Cache for 5 minutes
  });
}

// Hook to fetch multiple market titles at once
export function useMarketTitles(
  clobClient: ClobClient | null,
  conditionIds: string[]
) {
  return useQuery({
    queryKey: ["market-titles", conditionIds.sort().join(",")],
    queryFn: async (): Promise<Map<string, string>> => {
      if (!clobClient || conditionIds.length === 0) {
        return new Map();
      }

      const titlesMap = new Map<string, string>();
      const clobClientAny = clobClient as any;

      // Fetch titles for all condition IDs
      await Promise.allSettled(
        conditionIds.map(async (conditionId) => {
          // Skip if already in cache
          if (marketTitleCache.has(conditionId)) {
            const cached = marketTitleCache.get(conditionId);
            if (cached) titlesMap.set(conditionId, cached);
            return;
          }

          try {
            const market = await clobClientAny.getMarket(conditionId);
            const title = 
              market?.question || 
              market?.groupItemTitle || 
              market?.subtitle || 
              market?.title || 
              null;
            
            if (title) {
              marketTitleCache.set(conditionId, title);
              titlesMap.set(conditionId, title);
            }
          } catch (err) {
            console.warn(`Failed to fetch market title for ${conditionId}:`, err);
          }
        })
      );

      return titlesMap;
    },
    enabled: !!clobClient && conditionIds.length > 0,
    staleTime: 300_000, // Cache for 5 minutes
  });
}


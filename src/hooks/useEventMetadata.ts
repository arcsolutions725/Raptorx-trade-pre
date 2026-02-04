/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useQuery } from "@tanstack/react-query";

export function useEventMetadata(eventTicker: string | null) {
  const query = useQuery({
    queryKey: ["event-metadata", eventTicker],
    queryFn: async () => {
      if (!eventTicker) return null;

      try {
        const metadataUrl = `https://api.elections.kalshi.com/trade-api/v2/events/${eventTicker}/metadata`;
        const response = await fetch(metadataUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          return null;
        }

        const metadataData = await response.json();
        return metadataData.image_url || null;
      } catch (error) {
        console.warn("Failed to fetch event metadata:", error);
        return null;
      }
    },
    enabled: !!eventTicker,
    staleTime: 300_000,
    retry: 1,
  });

  return {
    imageUrl: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}


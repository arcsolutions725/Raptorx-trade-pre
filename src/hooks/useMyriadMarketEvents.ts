"use client";

import { useQuery } from "@tanstack/react-query";

export type MyriadMarketEvent = {
  user: string;
  action: string;
  outcomeTitle?: string;
  outcomeId?: number;
  shares?: number;
  value?: number;
  timestamp?: number;
};

type EventsResponse = {
  data?: MyriadMarketEvent[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext?: boolean;
  };
  error?: string;
};

export function useMyriadMarketEvents(
  slug: string | null,
  page = 1,
  limit = 30,
  enabled = true
) {
  return useQuery({
    queryKey: ["myriad-events", slug, page, limit],
    enabled: enabled && !!slug?.trim(),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({
        slug: slug!.trim(),
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/myriad/events?${params}`, { cache: "no-store" });
      const json = (await res.json()) as EventsResponse;
      if (!res.ok) {
        throw new Error(json.error || `Events ${res.status}`);
      }
      return json;
    },
  });
}

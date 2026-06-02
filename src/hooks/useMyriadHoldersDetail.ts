"use client";

import { useQuery } from "@tanstack/react-query";

export type MyriadHolderRow = { user: string; shares: number };

export type MyriadHoldersOutcomeGroup = {
  outcomeId: number;
  outcomeTitle: string;
  totalHolders: number;
  holders: MyriadHolderRow[];
};

type HoldersResponse = {
  data?: MyriadHoldersOutcomeGroup[];
  pagination?: unknown;
  error?: string;
};

export function useMyriadHoldersDetail(
  slug: string | null,
  page = 1,
  limit = 15,
  enabled = true
) {
  return useQuery({
    queryKey: ["myriad-holders", slug, page, limit],
    enabled: enabled && !!slug?.trim(),
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({
        slug: slug!.trim(),
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/myriad/holders?${params}`, { cache: "no-store" });
      const json = (await res.json()) as HoldersResponse;
      if (!res.ok) {
        throw new Error(json.error || `Holders ${res.status}`);
      }
      return json;
    },
  });
}

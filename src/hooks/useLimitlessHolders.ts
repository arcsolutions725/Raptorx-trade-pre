"use client";

import { useQuery } from "@tanstack/react-query";

export type LimitlessHolder = {
  user: string;
  username?: string;
  contracts: string;
  contractsFormatted: string;
  valueUSDC: string;
  valueUSDCFormatted: string;
  tokenId?: string;
  rankName?: string;
  points?: string;
  leaderboardPosition?: string;
};

export type LimitlessHoldersResponse = {
  yes: { data: LimitlessHolder[]; total: number };
  no: { data: LimitlessHolder[]; total: number };
};

export function useLimitlessHolders(
  slug: string | null,
  page: number = 1,
  limit: number = 10,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["limitless-holders", slug, page, limit],
    enabled: !!slug && enabled,
    queryFn: async () => {
      if (!slug) return { yes: { data: [], total: 0 }, no: { data: [], total: 0 } };
      const params = new URLSearchParams({ slug, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/limitless/holders?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch holders");
      const data = (await res.json()) as LimitlessHoldersResponse;
      return {
        yes: data?.yes ?? { data: [], total: 0 },
        no: data?.no ?? { data: [], total: 0 },
      };
    },
    staleTime: 30_000,
  });
}

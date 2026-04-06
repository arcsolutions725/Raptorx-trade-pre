"use client";

import { useQuery } from "@tanstack/react-query";

export type LimitlessNavItem = {
  id: string;
  name: string;
  slug: string;
  children: unknown[];
};

/** Maps category name -> [slug] for MarketCategory (same shape as Kalshi/Polymarket). */
export type LimitlessCategoriesData = Record<string, string[]>;

export function useLimitlessNavigation(enabled: boolean = true) {
  const query = useQuery({
    queryKey: ["limitless-navigation"],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/limitless/navigation", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error || `Failed to fetch navigation: ${res.status}`);
      }

      const items = (await res.json()) as LimitlessNavItem[];
      if (!Array.isArray(items)) return { tags_by_categories: {}, slugToId: {} };

      const tagsByCategory: LimitlessCategoriesData = {};
      const slugToId: Record<string, string> = {};
      items.forEach((item) => {
        const name = item.name?.trim() || item.slug || "Other";
        tagsByCategory[name] = [item.slug];
        if (item.slug && item.id) slugToId[item.slug] = item.id;
      });

      return { tags_by_categories: tagsByCategory, slugToId };
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  return {
    categoriesData: (query.data?.tags_by_categories || {}) as LimitlessCategoriesData,
    /** Map category slug -> category id for market-pages API */
    slugToId: (query.data?.slugToId || {}) as Record<string, string>,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

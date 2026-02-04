"use client";

import { useQuery } from "@tanstack/react-query";

export type PolymarketTag = {
  label: string;
  slug: string;
};

export type PolymarketTagsResponse = {
  tags: PolymarketTag[];
};

export function usePolymarketTags(
  categorySlug: string | null,
  enabled: boolean = true
) {
  const query = useQuery({
    queryKey: ["polymarket-tags", categorySlug],
    enabled: enabled && !!categorySlug,
    queryFn: async () => {
      if (!categorySlug) {
        return { tags: [] };
      }

      const params = new URLSearchParams({
        tag: categorySlug,
      });

      const res = await fetch(`/api/polymarket/tags?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({
          error: res.statusText,
          tags: [],
        }));
        console.error("Failed to fetch Polymarket tags:", errorData);
        throw new Error(
          errorData.error || `Failed to fetch tags: ${res.statusText}`
        );
      }

      const data = (await res.json()) as PolymarketTagsResponse;

      // Validate response structure
      if (!data || !Array.isArray(data.tags)) {
        console.error("Invalid tags response:", data);
        throw new Error("Invalid response structure from tags API");
      }

      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  return {
    tags: query.data?.tags || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// Helper function to get tag labels for display
export function getTagLabels(tags: PolymarketTag[]): string[] {
  return tags.map((tag) => tag.label);
}

// Helper function to get tag slug by label
export function getTagSlugByLabel(
  tags: PolymarketTag[],
  label: string
): string | null {
  const tag = tags.find((t) => t.label === label);
  return tag?.slug || null;
}


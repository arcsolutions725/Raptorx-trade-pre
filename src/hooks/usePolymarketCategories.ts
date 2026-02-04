"use client";

import { useQuery } from "@tanstack/react-query";

export type PolymarketCategoriesResponse = {
  tags_by_categories: Record<string, string[]>;
};

export function usePolymarketCategories(enabled: boolean = true) {
  const query = useQuery({
    queryKey: ["polymarket-categories"],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/polymarket/categories", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "force-cache",
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: res.statusText, tags_by_categories: {} }));
        console.error("Failed to fetch Polymarket categories:", errorData);
        const errorMessage =
          errorData?.error ||
          errorData?.message ||
          `Failed to fetch categories: ${res.statusText}`;
        throw new Error(errorMessage);
      }

      const data = (await res.json()) as PolymarketCategoriesResponse;

      // Validate response structure - allow empty object but log warning
      if (!data || typeof data !== "object") {
        console.error("Invalid categories response:", data);
        throw new Error("Invalid response structure from categories API");
      }

      // Check if tags_by_categories exists and is an object (empty is OK)
      if (
        !data.tags_by_categories ||
        typeof data.tags_by_categories !== "object"
      ) {
        console.warn(
          "Polymarket categories response missing tags_by_categories, using empty object"
        );
        return { tags_by_categories: {} };
      }

      // If tags_by_categories is empty, log warning but don't throw error
      if (Object.keys(data.tags_by_categories).length === 0) {
        console.warn(
          "Polymarket categories API returned empty tags_by_categories"
        );
      }

      return data;
    },
    staleTime: 1000 * 60 * 60,
    retry: 2,
  });

  return {
    categoriesData: query.data?.tags_by_categories || {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

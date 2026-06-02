/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  aggregateSubTagsFromCategories,
  type PredictFunSubTag,
} from "@/lib/predictfun/aggregateCategoryTags";
import {
  buildPredictFunCategoriesSearchParams,
  parsePredictFunCategoriesResponse,
} from "@/lib/predictfun/fetchCategories";
import { normalizePredictFunTagId } from "@/lib/predictfun/normalizeTagId";

/**
 * Sub-tags for primary categories (Politics → Trump; Sports → Soccer, …).
 * @see GET /v1/categories?tagIds={parentTagId}&status=OPEN&sort=POPULAR
 */
export function usePredictFunCategoryTags(
  parentTagId: string | number | null,
  enabled: boolean = true,
  excludeTopLevelTagIds: string[] = []
) {
  const normalizedParentId = normalizePredictFunTagId(parentTagId);

  const query = useQuery({
    queryKey: ["predictfun-category-tags", normalizedParentId],
    enabled: enabled && !!normalizedParentId,
    queryFn: async () => {
      const params = buildPredictFunCategoriesSearchParams({
        tagId: normalizedParentId,
        first: 60,
      });
      const res = await fetch(`/api/predictfun/categories?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Predict.fun category tags failed");
      }
      const json = await res.json();
      return parsePredictFunCategoriesResponse(json).categories;
    },
    staleTime: 60_000,
  });

  const tags = useMemo((): PredictFunSubTag[] => {
    if (!normalizedParentId) return [];
    const categories = query.data;
    if (!Array.isArray(categories)) return [];
    return aggregateSubTagsFromCategories(
      categories,
      normalizedParentId,
      excludeTopLevelTagIds
    );
  }, [query.data, normalizedParentId, excludeTopLevelTagIds]);

  return {
    tags,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
  };
}

export type { PredictFunSubTag };

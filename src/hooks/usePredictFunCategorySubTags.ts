"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  predictFunCategoryHasSubTags,
  resolvePredictFunCategorySubTags,
  type PredictFunCategorySubTag,
} from "@/lib/predictfun/categorySubTags";
import { normalizePredictFunTagId } from "@/lib/predictfun/normalizeTagId";
import type { PredictFunApiTag } from "@/lib/predictfun/staticNav";

/**
 * Sub-tags for a predict.fun category (Sports, Crypto, Politics, …).
 */
export function usePredictFunCategorySubTags(
  parentTagId: string | number | null,
  enabled: boolean = true
) {
  const normalizedParentId = normalizePredictFunTagId(parentTagId);
  const hasSubTags = predictFunCategoryHasSubTags(normalizedParentId);

  const tagsQuery = useQuery({
    queryKey: ["predictfun-tags"],
    enabled: enabled && hasSubTags,
    queryFn: async (): Promise<PredictFunApiTag[]> => {
      const res = await fetch("/api/predictfun/tags", { cache: "no-store" });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.data) ? (json.data as PredictFunApiTag[]) : [];
    },
    staleTime: 300_000,
  });

  const tags = useMemo((): PredictFunCategorySubTag[] => {
    if (!normalizedParentId || !hasSubTags) return [];
    return resolvePredictFunCategorySubTags(
      normalizedParentId,
      tagsQuery.data ?? []
    );
  }, [normalizedParentId, hasSubTags, tagsQuery.data]);

  return {
    tags,
    hasSubTags,
    isLoading: tagsQuery.isLoading && hasSubTags,
    isFetching: tagsQuery.isFetching,
  };
}

export type { PredictFunCategorySubTag };

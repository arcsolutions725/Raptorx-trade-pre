"use client";

import { useQuery } from "@tanstack/react-query";
import {
  PREDICT_FUN_POLITICS_SUB_TAGS_FALLBACK,
  resolvePredictFunPoliticsSubTags,
  type PredictFunPoliticsSubTag,
} from "@/lib/predictfun/politicsTags";
import type { PredictFunApiTag } from "@/lib/predictfun/staticNav";

/**
 * Trump + Global sub-tags for Politics (ids from GET /v1/tags when possible).
 */
export function usePredictFunPoliticsSubTags(enabled: boolean = true) {
  const query = useQuery({
    queryKey: ["predictfun-politics-sub-tags"],
    enabled,
    queryFn: async (): Promise<PredictFunPoliticsSubTag[]> => {
      const res = await fetch("/api/predictfun/tags", { cache: "no-store" });
      if (!res.ok) return PREDICT_FUN_POLITICS_SUB_TAGS_FALLBACK;
      const json = await res.json();
      const tags = Array.isArray(json?.data) ? (json.data as PredictFunApiTag[]) : [];
      return resolvePredictFunPoliticsSubTags(tags);
    },
    staleTime: 300_000,
  });

  return {
    tags: query.data ?? PREDICT_FUN_POLITICS_SUB_TAGS_FALLBACK,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}

export type { PredictFunPoliticsSubTag };

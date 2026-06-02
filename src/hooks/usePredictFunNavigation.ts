"use client";

import { useMemo } from "react";
import {
  buildPredictFunCategoriesData,
  PREDICT_FUN_ALL_NAV,
  PREDICT_FUN_DEFAULT_CATEGORY_VALUE,
  PREDICT_FUN_MORE_NAV,
  PREDICT_FUN_PRIMARY_NAV,
  predictFunTagIdFromLabel,
} from "@/lib/predictfun/navigation";

export type PredictFunTag = {
  id: string;
  name: string;
};

/**
 * Static navigation from predict-fun-tags.json (predict.fun category bar).
 */
export function usePredictFunNavigation(enabled: boolean = true) {
  const categoriesData = useMemo(
    () => (enabled ? buildPredictFunCategoriesData() : { All: ["predictfun:all"] }),
    [enabled]
  );

  const nameToTagId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const item of PREDICT_FUN_ALL_NAV) {
      if (item.tagId) m[item.label.toLowerCase()] = item.tagId;
    }
    m.all = "";
    m.trending = "";
    return m;
  }, []);

  const tagIdToName = useMemo(() => {
    const out: Record<string, string> = {};
    for (const item of PREDICT_FUN_ALL_NAV) {
      if (item.tagId) out[item.tagId] = item.label;
    }
    return out;
  }, []);

  return {
    categoriesData,
    primaryNav: PREDICT_FUN_PRIMARY_NAV,
    moreNav: PREDICT_FUN_MORE_NAV,
    allNav: PREDICT_FUN_ALL_NAV,
    nameToTagId,
    tagIdToName,
    tagIdFromLabel: predictFunTagIdFromLabel,
    defaultCategoryValue: PREDICT_FUN_DEFAULT_CATEGORY_VALUE,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    refetch: async () => {},
  };
}

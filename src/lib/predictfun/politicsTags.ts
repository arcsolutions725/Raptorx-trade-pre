/**
 * Politics sidebar on https://predict.fun/markets/politics (parent tag Politics = "1").
 */

import type { PredictFunApiTag } from "@/lib/predictfun/staticNav";

export const PREDICT_FUN_POLITICS_PARENT_TAG_ID = "1";

export type PredictFunPoliticsSubTag = {
  label: string;
  /** String tag id for GET /categories?tagIds= */
  tagId: string;
};

/** Fallback when GET /v1/tags is unavailable or missing names (mainnet uses live ids). */
export const PREDICT_FUN_POLITICS_SUB_TAGS_FALLBACK: PredictFunPoliticsSubTag[] = [
  { label: "Trump", tagId: "40" },
  { label: "Global", tagId: "114" },
];

export const PREDICT_FUN_POLITICS_SUB_TAG_NAMES = ["Trump", "Global"] as const;

export function predictFunIsPoliticsParentTagId(
  tagId: string | null | undefined
): boolean {
  return tagId === PREDICT_FUN_POLITICS_PARENT_TAG_ID;
}

export function resolvePredictFunPoliticsSubTags(
  apiTags: PredictFunApiTag[]
): PredictFunPoliticsSubTag[] {
  const resolved: PredictFunPoliticsSubTag[] = [];
  for (const name of PREDICT_FUN_POLITICS_SUB_TAG_NAMES) {
    const hit = apiTags.find((t) => t.name === name);
    if (hit?.id) resolved.push({ label: name, tagId: String(hit.id) });
  }
  if (resolved.length === PREDICT_FUN_POLITICS_SUB_TAG_NAMES.length) {
    return resolved;
  }
  return PREDICT_FUN_POLITICS_SUB_TAGS_FALLBACK;
}

export function predictFunPoliticsSubTagIds(): Set<string> {
  return new Set(
    PREDICT_FUN_POLITICS_SUB_TAGS_FALLBACK.map((t) => t.tagId)
  );
}

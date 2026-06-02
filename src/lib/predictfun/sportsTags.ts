/**
 * Sports sidebar on https://predict.fun/markets (parent tag Sports = "4").
 * Sub-tag clicks use GET /categories?tagIds={id}&sort=POPULAR&status=OPEN.
 */

export const PREDICT_FUN_SPORTS_PARENT_TAG_ID = "4";

export type PredictFunSportsSubTag = {
  label: string;
  /** String tag id for GET /categories?tagIds= */
  tagId: string;
};

/** Matches predict.fun “All Sports” list (World Cup, Soccer, …). */
export const PREDICT_FUN_SPORTS_SUB_TAGS: PredictFunSportsSubTag[] = [
  { label: "World Cup", tagId: "113" },
  { label: "Soccer", tagId: "14" },
  { label: "Basketball", tagId: "114" },
  { label: "Hockey", tagId: "134" },
  { label: "Baseball", tagId: "143" },
];

export const PREDICT_FUN_SPORTS_SUB_TAG_IDS = new Set(
  PREDICT_FUN_SPORTS_SUB_TAGS.map((t) => t.tagId)
);

export function predictFunIsSportsParentTagId(
  tagId: string | null | undefined
): boolean {
  return tagId === PREDICT_FUN_SPORTS_PARENT_TAG_ID;
}

export function predictFunIsSportsSubTagId(
  tagId: string | null | undefined
): boolean {
  return !!tagId && PREDICT_FUN_SPORTS_SUB_TAG_IDS.has(tagId);
}

export function predictFunSportsSubTagFromValue(
  value: string | null | undefined
): PredictFunSportsSubTag | null {
  if (!value) return null;
  const id = value.startsWith("predictfun:")
    ? value.slice("predictfun:".length)
    : value;
  return PREDICT_FUN_SPORTS_SUB_TAGS.find((t) => t.tagId === id) ?? null;
}

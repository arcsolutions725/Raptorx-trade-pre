/**

 * Predict.fun navigation — static bar from predict-fun-tags.json

 * @see https://predict.fun/markets

 */



import {
  buildStaticPredictFunNav,
  PREDICT_FUN_STATIC_NAV_SPECS,
  type PredictFunNavItem,
} from "@/lib/predictfun/staticNav";
import { normalizePredictFunTagId } from "@/lib/predictfun/normalizeTagId";
import {
  predictFunCategoryHasSubTags,
  predictFunSubTagIdFromLabel,
} from "@/lib/predictfun/categorySubTags";

export type PredictFunCategorySort = "POPULAR" | "PUBLISHED_AT_DESC";

export type { PredictFunNavItem };



const staticNav = buildStaticPredictFunNav();



/** Primary tabs: All, New, Sports, … */

export const PREDICT_FUN_PRIMARY_NAV: PredictFunNavItem[] = staticNav.primary;



/** “More” tags shown after Culture in the category bar */

export const PREDICT_FUN_MORE_NAV: PredictFunNavItem[] = staticNav.more;



/** All tabs in display order (primary + more) */

export const PREDICT_FUN_ALL_NAV: PredictFunNavItem[] = staticNav.all;



export const PREDICT_FUN_DEFAULT_CATEGORY_VALUE = "predictfun:all";

/** "New" tab — no sub-tag row on predict.fun */
export const PREDICT_FUN_NEW_TAG_ID = "3";

export function predictFunCategoryShowsSubTagNav(
  tagId: string | null | undefined
): boolean {
  return predictFunCategoryHasSubTags(tagId);
}



/** Rex MarketCategory shape: label → [value] — full static bar */

export function buildPredictFunCategoriesData(): Record<string, string[]> {

  const out: Record<string, string[]> = {};

  for (const item of PREDICT_FUN_ALL_NAV) {

    out[item.label] = [item.value];

  }

  return out;

}



export function predictFunLabelFromValue(value: string | null): string | null {

  if (!value) return null;

  return PREDICT_FUN_ALL_NAV.find((i) => i.value === value)?.label ?? null;

}



export function predictFunTagIdFromValue(value: string | null): string | null {

  return normalizePredictFunTagId(value);

}



export function predictFunSortForCategoryValue(
  categoryValue: string | null,
  nav: PredictFunNavItem[] = PREDICT_FUN_ALL_NAV
): PredictFunCategorySort {
  if (!categoryValue) return "POPULAR";
  const hit = nav.find((i) => i.value === categoryValue);
  return hit?.sort ?? "POPULAR";
}

export function predictFunSortForTagId(
  tagId: string | null,
  nav: PredictFunNavItem[] = PREDICT_FUN_ALL_NAV
): PredictFunCategorySort {
  if (!tagId) return "POPULAR";
  const hit = nav.find((i) => i.tagId === tagId);
  return hit?.sort ?? "POPULAR";
}

export function predictFunTagIdFromLabel(label: string | null): string | null {
  if (!label) return null;
  const norm = label.trim().toLowerCase();
  if (norm === "all" || norm === "trending") return null;
  const subHit = predictFunSubTagIdFromLabel(label);
  if (subHit) return subHit;
  const hit = PREDICT_FUN_ALL_NAV.find((i) => i.label.toLowerCase() === norm);
  return hit?.tagId ? String(hit.tagId) : null;
}



/** All top-level tab tag ids (for sub-tag aggregation excludes). */

export function predictFunAllTopLevelTagIds(): string[] {

  return PREDICT_FUN_ALL_NAV.map((i) => i.tagId).filter((id): id is string => !!id);

}



export { PREDICT_FUN_STATIC_NAV_SPECS };



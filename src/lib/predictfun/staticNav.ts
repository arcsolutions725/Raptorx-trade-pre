/**
 * Static category bar matching https://predict.fun/markets
 * Tag ids are strings from predict-fun-tags.json (GET /v1/tags).
 */

import tagsJson from "@/lib/predictfun/predict-fun-tags.json";

export type PredictFunNavItem = {
  label: string;
  value: string;
  /** String tag id for GET /categories?tagIds= */
  tagId: string | null;
  sort?: "POPULAR" | "PUBLISHED_AT_DESC";
};

export type PredictFunApiTag = {
  id: string;
  name: string;
  level?: number | null;
};

/** Primary row + More menu — explicit tagId strings from predict-fun-tags.json */
export const PREDICT_FUN_STATIC_NAV_SPECS: Array<{
  label: string;
  tagId: string | null;
  group: "primary" | "more";
}> = [
  { label: "All", tagId: null, group: "primary" },
  { label: "Sports", tagId: "4", group: "primary" },
  { label: "Politics", tagId: "1", group: "primary" },
  { label: "Crypto", tagId: "2", group: "primary" },
  { label: "Esports", tagId: "83", group: "primary" },
  { label: "Finance", tagId: "11", group: "primary" },
  { label: "Economy", tagId: "6", group: "primary" },
  { label: "Culture", tagId: "13", group: "primary" },
  { label: "BNB", tagId: "159", group: "more" },
  { label: "Commodities", tagId: "144", group: "more" },
  { label: "Cricket", tagId: "97", group: "more" },
  { label: "International Friendlies", tagId: "243", group: "more" },
  { label: "MLB", tagId: "142", group: "more" },
  { label: "NBA", tagId: "78", group: "more" },
  { label: "NHL", tagId: "79", group: "more" },
  { label: "Soccer", tagId: "14", group: "more" },
  { label: "Tennis", tagId: "85", group: "more" },
  { label: "World Cup", tagId: "113", group: "more" },
];

export function getPredictFunTagsFromJson(): PredictFunApiTag[] {
  const raw = (tagsJson as { data?: PredictFunApiTag[] }).data;
  return Array.isArray(raw) ? raw : [];
}

/** Verify static ids still exist in tags JSON (dev sanity check). */
export function assertStaticNavMatchesTagsJson(): void {
  const tags = getPredictFunTagsFromJson();
  const byId = new Map(tags.map((t) => [String(t.id), t.name]));
  for (const spec of PREDICT_FUN_STATIC_NAV_SPECS) {
    if (!spec.tagId) continue;
    const name = byId.get(spec.tagId);
    if (!name) {
      console.warn(
        `[predictfun] static nav "${spec.label}" tagId ${spec.tagId} not in predict-fun-tags.json`
      );
    }
  }
}

export function buildStaticPredictFunNav(): {
  all: PredictFunNavItem[];
  primary: PredictFunNavItem[];
  more: PredictFunNavItem[];
} {
  const all: PredictFunNavItem[] = [];
  const primary: PredictFunNavItem[] = [];
  const more: PredictFunNavItem[] = [];

  for (const spec of PREDICT_FUN_STATIC_NAV_SPECS) {
    const tagId = spec.tagId ? String(spec.tagId) : null;
    const item: PredictFunNavItem = {
      label: spec.label,
      value: tagId ? `predictfun:${tagId}` : "predictfun:all",
      tagId,
      sort: "POPULAR",
    };
    all.push(item);
    if (spec.group === "primary") primary.push(item);
    else more.push(item);
  }

  return { all, primary, more };
}


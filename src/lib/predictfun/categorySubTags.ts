/**
 * Static sub-tags per predict.fun primary category (sidebar on predict.fun/markets).
 * @see https://predict.fun/markets
 */

import type { PredictFunApiTag } from "@/lib/predictfun/staticNav";
import { normalizePredictFunTagId } from "@/lib/predictfun/normalizeTagId";

export type PredictFunCategorySubTag = {
  label: string;
  /** String tag id for GET /categories?tagIds= */
  tagId: string;
};

export type PredictFunCategorySubTagSpec = {
  label: string;
  /** Names to match on GET /v1/tags (first hit wins). */
  matchNames: string[];
  fallbackId: string;
};

/** Parent tag id → sub-tags (predict.fun sidebar). */
export const PREDICT_FUN_CATEGORY_SUB_TAG_SPECS: Record<
  string,
  PredictFunCategorySubTagSpec[]
> = {
  /** Sports */
  "4": [
    { label: "World Cup", matchNames: ["World Cup"], fallbackId: "113" },
    { label: "Soccer", matchNames: ["Soccer"], fallbackId: "14" },
    { label: "Basketball", matchNames: ["Basketball"], fallbackId: "114" },
    { label: "Hockey", matchNames: ["Hockey", "NHL"], fallbackId: "134" },
    { label: "Baseball", matchNames: ["Baseball", "MLB"], fallbackId: "143" },
  ],
  /** Politics */
  "1": [
    { label: "Trump", matchNames: ["Trump"], fallbackId: "40" },
    { label: "Global", matchNames: ["Global"], fallbackId: "114" },
  ],
  /** Crypto — sidebar time buckets (predict.fun shows 6) */
  "2": [
    { label: "5 Min", matchNames: ["5 Min"], fallbackId: "80" },
    { label: "15 Min", matchNames: ["15 Min"], fallbackId: "74" },
    { label: "1 Hour", matchNames: ["1 Hour"], fallbackId: "75" },
    { label: "Daily", matchNames: ["Daily"], fallbackId: "76" },
    { label: "Pre-Market", matchNames: ["Pre-Market"], fallbackId: "52" },
    { label: "Bitcoin", matchNames: ["Bitcoin", "BTC"], fallbackId: "68" },
  ],
  /** Esports */
  "83": [
    { label: "CS2", matchNames: ["CS2"], fallbackId: "93" },
    { label: "LoL", matchNames: ["LoL"], fallbackId: "57" },
    { label: "Dota 2", matchNames: ["Dota 2"], fallbackId: "16" },
  ],
  /** Finance */
  "11": [
    { label: "Commodities", matchNames: ["Commodities"], fallbackId: "144" },
    { label: "IPO", matchNames: ["IPO"], fallbackId: "56" },
    {
      label: "Market Cap",
      matchNames: ["Market Cap", "Company Market Cap / IPO"],
      fallbackId: "56",
    },
    { label: "Stocks", matchNames: ["Stocks"], fallbackId: "55" },
    { label: "Pre-IPO", matchNames: ["Pre-IPO", "Pre IPO"], fallbackId: "54" },
  ],
  /** Economy */
  "6": [{ label: "Fed", matchNames: ["Fed", "JPOW"], fallbackId: "137" }],
  /** Culture */
  "13": [{ label: "Tweets", matchNames: ["Tweets"], fallbackId: "124" }],
};

/** Top-level tabs / More items with no sub-tag row. */
export const PREDICT_FUN_NO_SUB_TAG_PARENT_IDS = new Set([
  "3", // New
  "159", // BNB
  "144", // Commodities (More bar)
  "97", // Cricket
  "243", // International Friendlies
  "142", // MLB
  "78", // NBA
  "79", // NHL
  "14", // Soccer (More)
  "85", // Tennis (More)
  "177", // UFC (More)
  "113", // World Cup (More)
]);

export function predictFunCategoryHasSubTags(
  parentTagId: string | null | undefined
): boolean {
  const id = normalizePredictFunTagId(parentTagId);
  if (!id || PREDICT_FUN_NO_SUB_TAG_PARENT_IDS.has(id)) return false;
  return id in PREDICT_FUN_CATEGORY_SUB_TAG_SPECS;
}

export function resolvePredictFunCategorySubTags(
  parentTagId: string,
  apiTags: PredictFunApiTag[] = []
): PredictFunCategorySubTag[] {
  const specs = PREDICT_FUN_CATEGORY_SUB_TAG_SPECS[parentTagId];
  if (!specs?.length) return [];

  const byName = new Map(apiTags.map((t) => [t.name.trim(), String(t.id)]));
  const usedIds = new Set<string>();

  return specs.map((spec) => {
    let tagId = spec.fallbackId;
    for (const name of spec.matchNames) {
      const hit = byName.get(name);
      if (hit && !usedIds.has(hit)) {
        tagId = hit;
        break;
      }
    }
    usedIds.add(tagId);
    return { label: spec.label, tagId };
  });
}

export function getAllPredictFunCategorySubTags(): PredictFunCategorySubTag[] {
  const out: PredictFunCategorySubTag[] = [];
  for (const specs of Object.values(PREDICT_FUN_CATEGORY_SUB_TAG_SPECS)) {
    for (const spec of specs) {
      out.push({ label: spec.label, tagId: spec.fallbackId });
    }
  }
  return out;
}

export function predictFunSubTagIdFromLabel(label: string | null): string | null {
  if (!label) return null;
  const norm = label.trim().toLowerCase();
  for (const specs of Object.values(PREDICT_FUN_CATEGORY_SUB_TAG_SPECS)) {
    const hit = specs.find((s) => s.label.toLowerCase() === norm);
    if (hit) return hit.fallbackId;
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { isPredictFunCategoryActive } from "@/lib/predictfun/filterOpenMarkets";

export type PredictFunSubTag = {
  id: string;
  name: string;
  /** Number of OPEN categories that include this tag */
  count: number;
};

function tagLevel(t: any): number {
  return t?.level == null ? 0 : Number(t.level);
}

/**
 * Build sub-tags for a primary category from GET /v1/categories?tagIds={parentTagId}.
 * Uses the deepest tag on each category (e.g. Sports → Football), or level-null
 * co-tags (e.g. Politics → Trump) — not every unrelated tag on the category.
 */
export function aggregateSubTagsFromCategories(
  categories: any[],
  parentTagId: string,
  /** Top-level tab tag ids — never show as sub-tags under another category. */
  excludeTagIds: string[] = []
): PredictFunSubTag[] {
  const exclude = new Set([parentTagId, ...excludeTagIds]);
  const counts = new Map<string, { name: string; count: number }>();

  let parentLevel = 0;
  for (const cat of categories) {
    const hit = (cat.tags ?? []).find(
      (t: any) => String(t?.id) === parentTagId
    );
    if (hit) {
      parentLevel = tagLevel(hit);
      break;
    }
  }

  for (const cat of categories) {
    if (!isPredictFunCategoryActive(cat)) continue;
    const catTags = Array.isArray(cat.tags) ? cat.tags : [];
    const others = catTags.filter(
      (t: any) => String(t?.id ?? "").trim() !== parentTagId
    );
    if (others.length === 0) continue;

    const maxLevel = Math.max(...others.map(tagLevel));
    const leafTags = others.filter(
      (t: any) => tagLevel(t) === maxLevel && maxLevel > parentLevel
    );

    const candidates =
      leafTags.length > 0
        ? leafTags
        : others.filter((t: any) => {
            if (t?.level != null) return false;
            const id = String(t?.id ?? "").trim();
            return id && !exclude.has(id);
          });

    for (const t of candidates) {
      const id = String(t?.id ?? "").trim();
      const name = String(t?.name ?? "").trim();
      if (!id || !name) continue;
      const prev = counts.get(id);
      if (prev) prev.count += 1;
      else counts.set(id, { name, count: 1 });
    }
  }

  return Array.from(counts.entries())
    .map(([id, { name, count }]) => ({ id, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

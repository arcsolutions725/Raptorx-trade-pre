/**
 * GET /v1/categories — mirrors predict.fun GetCategories GraphQL.
 *
 * All: no tagIds, status="OPEN", first="25"
 * New: tagIds=3, status="OPEN", first="25"
 */

import {
  PREDICT_FUN_CATEGORY_STATUS,
  PREDICT_FUN_CATEGORIES_PAGE_SIZE,
} from "@/lib/predictfun/serverFetch";
import { flattenOpenMarketsFromCategories } from "@/lib/predictfun/filterOpenMarkets";
import {
  formatPredictFunTagIdsQueryValue,
  normalizePredictFunTagId,
} from "@/lib/predictfun/normalizeTagId";

export type PredictFunCategoryFetchResult = {
  categories: unknown[];
  markets: unknown[];
  cursor: string | null;
};

export type FetchPredictFunCategoriesParams = {
  tagId?: string | number | null;
  first?: number | string;
  after?: string | null;
};

export function isPredictFunAllCategoriesFilter(
  tagId: string | number | null | undefined
): boolean {
  return normalizePredictFunTagId(tagId) === null;
}

export function buildPredictFunCategoriesSearchParams(
  params: FetchPredictFunCategoriesParams
): URLSearchParams {
  const firstNum = Math.max(
    1,
    parseInt(String(params.first ?? PREDICT_FUN_CATEGORIES_PAGE_SIZE), 10) ||
      PREDICT_FUN_CATEGORIES_PAGE_SIZE
  );

  const search = new URLSearchParams({
    status: PREDICT_FUN_CATEGORY_STATUS,
    first: String(firstNum),
  });

  const tagId = normalizePredictFunTagId(params.tagId);
  if (tagId) {
    search.set("tagIds", formatPredictFunTagIdsQueryValue(tagId));
  }

  const after = params.after?.trim();
  if (after) search.set("after", after);

  return search;
}

export function parsePredictFunCategoriesResponse(
  json: unknown
): PredictFunCategoryFetchResult {
  const body = json as { data?: unknown[]; cursor?: string | null };
  const categories = Array.isArray(body?.data) ? body.data : [];
  return {
    categories,
    markets: flattenOpenMarketsFromCategories(categories),
    cursor: body?.cursor ?? null,
  };
}

import { NextRequest, NextResponse } from "next/server";

import {

  applyPredictFunCategoryDefaults,

  predictFunGetJson,

} from "@/lib/predictfun/serverFetch";

import { normalizePredictFunTagId } from "@/lib/predictfun/normalizeTagId";
import {
  PREDICT_FUN_CATEGORIES_PAGE_SIZE,
  PREDICT_FUN_CATEGORY_STATUS,
} from "@/lib/predictfun/serverFetch";

const ALLOWED_STATUS = new Set(["OPEN", "ACTIVE", "RESOLVED", "REMOVED"]);
const ALLOWED_SORT = new Set(["POPULAR", "PUBLISHED_AT_DESC"]);

/**
 * GET /api/predictfun/categories
 * Proxies GET /v1/categories — query values: tagIds, status (OPEN), first (no sort, no includeStats).
 */

export async function GET(request: NextRequest) {

  const incoming = request.nextUrl.searchParams;

  const slug = incoming.get("slug")?.trim();

  const params = new URLSearchParams(incoming.toString());

  params.delete("slug");



  const statusRaw = (params.get("status") ?? PREDICT_FUN_CATEGORY_STATUS)
    .trim()
    .toUpperCase();
  params.set(
    "status",
    ALLOWED_STATUS.has(statusRaw) ? statusRaw : PREDICT_FUN_CATEGORY_STATUS
  );

  const sortRaw = (params.get("sort") ?? "POPULAR").trim().toUpperCase();
  if (ALLOWED_SORT.has(sortRaw)) params.set("sort", sortRaw);
  else params.set("sort", "POPULAR");

  const limitRaw = params.get("limit");
  if (limitRaw != null && !params.has("first")) {
    params.set(
      "first",
      String(
        Math.max(
          1,
          parseInt(String(limitRaw), 10) || PREDICT_FUN_CATEGORIES_PAGE_SIZE
        )
      )
    );
  }
  params.delete("limit");

  const firstRaw = params.get("first");
  if (firstRaw != null) {
    const n = Math.max(
      1,
      parseInt(String(firstRaw), 10) || PREDICT_FUN_CATEGORIES_PAGE_SIZE
    );
    params.set("first", String(n));
  } else {
    params.set("first", String(PREDICT_FUN_CATEGORIES_PAGE_SIZE));
  }



  const tagId = normalizePredictFunTagId(params.get("tagIds"));

  if (tagId) params.set("tagIds", tagId);
  else params.delete("tagIds");



  if (!params.has("includeStats")) {
    params.set("includeStats", "true");
  }

  applyPredictFunCategoryDefaults(params);



  const path = slug

    ? `/categories/${encodeURIComponent(slug)}`

    : "/categories";



  try {

    const { ok, status: httpStatus, body, text } = await predictFunGetJson(

      path,

      params

    );

    if (!ok) {

      return NextResponse.json(

        {

          error: `Predict.fun API error (${httpStatus})`,

          detail: text.slice(0, 500),

        },

        { status: httpStatus >= 500 ? 502 : httpStatus }

      );

    }

    return NextResponse.json(body);

  } catch (e) {

    const msg = e instanceof Error ? e.message : String(e);

    return NextResponse.json(

      { error: `Predict.fun proxy failed: ${msg}` },

      { status: 502 }

    );

  }

}



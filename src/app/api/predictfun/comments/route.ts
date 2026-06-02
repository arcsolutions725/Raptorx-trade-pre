import { NextRequest, NextResponse } from "next/server";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";

type Attempt = {
  path: string;
  params?: URLSearchParams;
};

function hasCommentsPayload(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  const data = (b.data ?? b) as Record<string, unknown>;
  const candidates = [
    data.comments,
    data.posts,
    data.discussions,
    data.items,
    data.edges,
    data.nodes,
    data.commentFeed,
    data.commentList,
    (data.social as Record<string, unknown> | undefined)?.comments,
    (data.discussion as Record<string, unknown> | undefined)?.comments,
  ];
  return candidates.some((c) => Array.isArray(c) && c.length > 0);
}

/**
 * GET /api/predictfun/comments?categorySlug=...&marketId=...
 *
 * Predict.fun comment data is not consistently exposed in one shape/route.
 * Try known/legacy paths and return the first payload that contains comments.
 */
export async function GET(request: NextRequest) {
  const categorySlug = request.nextUrl.searchParams.get("categorySlug")?.trim();
  const marketId = request.nextUrl.searchParams.get("marketId")?.trim();
  const first = request.nextUrl.searchParams.get("first")?.trim() || "50";

  if (!categorySlug && !marketId) {
    return NextResponse.json(
      { error: "Missing categorySlug or marketId" },
      { status: 400 }
    );
  }

  const attempts: Attempt[] = [];

  if (categorySlug) {
    attempts.push({
      path: `/categories/${encodeURIComponent(categorySlug)}`,
      params: new URLSearchParams({ includeStats: "true", first }),
    });
    attempts.push({
      path: `/categories/${encodeURIComponent(categorySlug)}/comments`,
      params: new URLSearchParams({ first }),
    });
    attempts.push({
      path: "/comments",
      params: new URLSearchParams({ categorySlug, first }),
    });
    attempts.push({
      path: "/comments",
      params: new URLSearchParams({ categoryId: categorySlug, first }),
    });
  }

  if (marketId) {
    attempts.push({
      path: `/markets/${encodeURIComponent(marketId)}`,
      params: new URLSearchParams({ includeStats: "true" }),
    });
    attempts.push({
      path: `/markets/${encodeURIComponent(marketId)}/comments`,
      params: new URLSearchParams({ first }),
    });
    attempts.push({
      path: "/comments",
      params: new URLSearchParams({ marketId, first }),
    });
  }

  let lastStatus = 404;
  let lastErrorDetail = "No comments payload found";

  for (const attempt of attempts) {
    try {
      const { ok, status, body, text } = await predictFunGetJson(
        attempt.path,
        attempt.params
      );

      if (!ok) {
        lastStatus = status;
        lastErrorDetail = text.slice(0, 500);
        continue;
      }

      if (hasCommentsPayload(body)) {
        return NextResponse.json(body);
      }
    } catch (e) {
      lastStatus = 502;
      lastErrorDetail = e instanceof Error ? e.message : String(e);
    }
  }

  // Return empty data payload rather than erroring the UI.
  return NextResponse.json({
    success: true,
    data: { comments: [] },
    meta: {
      warning: "Predict.fun comments unavailable for this market",
      categorySlug: categorySlug ?? null,
      marketId: marketId ?? null,
      status: lastStatus,
      detail: lastErrorDetail,
    },
  });
}

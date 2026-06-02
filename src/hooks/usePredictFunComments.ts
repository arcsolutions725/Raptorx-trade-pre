"use client";

import { useQuery } from "@tanstack/react-query";

export type PredictFunComment = {
  id: string;
  body: string;
  createdAt: string;
  author?: string;
  positionLabel?: string;
};

function pickCommentCollections(data: Record<string, unknown>): unknown[] {
  const social = data.social as Record<string, unknown> | undefined;
  const discussion = data.discussion as Record<string, unknown> | undefined;
  return [
    data.comments,
    data.posts,
    data.discussions,
    data.replies,
    data.items,
    data.nodes,
    data.edges,
    data.commentFeed,
    data.commentList,
    data.commentData,
    social?.comments,
    discussion?.comments,
  ];
}

function extractCommentsFromBody(body: unknown): PredictFunComment[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const data = (b.data ?? b) as Record<string, unknown>;

  const candidates = pickCommentCollections(data);
  for (const c of candidates) {
    const rows = Array.isArray(c)
      ? c
      : c && typeof c === "object"
        ? ((c as { edges?: unknown; nodes?: unknown; items?: unknown }).edges ??
          (c as { edges?: unknown; nodes?: unknown; items?: unknown }).nodes ??
          (c as { edges?: unknown; nodes?: unknown; items?: unknown }).items ??
          [])
        : [];
    if (!Array.isArray(rows)) continue;
    const out: PredictFunComment[] = [];
    rows.forEach((item, idx) => {
      if (!item || typeof item !== "object") return;
      const edgeNode = (item as { node?: unknown }).node;
      const row =
        edgeNode && typeof edgeNode === "object"
          ? (edgeNode as Record<string, unknown>)
          : (item as Record<string, unknown>);
      const text = String(row.body ?? row.text ?? row.content ?? row.message ?? "").trim();
      if (!text) return;
      const authorRaw = String(
        row.author ??
          row.name ??
          row.username ??
          (row.profile as { name?: string } | undefined)?.name ??
          (row.user as { name?: string; username?: string } | undefined)?.name ??
          (row.user as { name?: string; username?: string } | undefined)?.username ??
          row.userAddress ??
          ""
      ).trim();
      const positionRaw = String(row.positionLabel ?? row.position ?? "").trim();
      out.push({
        id: String(row.id ?? row.commentId ?? `comment-${idx}`),
        body: text,
        createdAt: String(row.createdAt ?? row.created_at ?? row.timestamp ?? ""),
        ...(authorRaw ? { author: authorRaw } : {}),
        ...(positionRaw ? { positionLabel: positionRaw } : {}),
      });
    });
    return out;
  }
  return [];
}

/** Best-effort category comments from Predict.fun API (when exposed on category payload). */
export function usePredictFunComments(
  categorySlug: string | null,
  marketId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: ["predictfun-comments", categorySlug, marketId],
    enabled: enabled && (!!categorySlug || !!marketId),
    queryFn: async (): Promise<PredictFunComment[]> => {
      if (!categorySlug && !marketId) return [];
      const params = new URLSearchParams();
      if (categorySlug) {
        // Prefer top-level event/category comments when available.
        params.set("categorySlug", categorySlug);
      } else if (marketId) {
        params.set("marketId", marketId);
      }
      const res = await fetch(
        `/api/predictfun/comments?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return extractCommentsFromBody(json);
    },
    staleTime: 60_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

export type LimitlessComment = {
  id?: string;
  user?: string;
  username?: string;
  content?: string;
  created_at?: string;
  created_at_ts?: number;
  [key: string]: unknown;
};

export type LimitlessCommentsResponse = {
  data?: LimitlessComment[];
  comments?: LimitlessComment[];
  total?: number;
};

export function useLimitlessComments(
  slug: string | null,
  page: number = 1,
  limit: number = 10,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["limitless-comments", slug, page, limit],
    enabled: !!slug && enabled,
    queryFn: async () => {
      if (!slug) return { comments: [], total: 0 };
      const params = new URLSearchParams({ slug, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/limitless/comments?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = (await res.json()) as LimitlessCommentsResponse | LimitlessComment[];
      const comments = Array.isArray(data)
        ? data
        : (data?.data ?? data?.comments ?? []);
      const total = Array.isArray(data) ? data.length : (data as LimitlessCommentsResponse)?.total ?? comments.length;
      return { comments, total };
    },
    staleTime: 30_000,
  });
}

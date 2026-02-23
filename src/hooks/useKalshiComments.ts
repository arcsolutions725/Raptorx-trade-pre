import { useQuery } from "@tanstack/react-query";

export type KalshiComment = {
  id: string;
  post_id: string;
  social_id: string;
  nickname: string;
  content: string;
  image_path?: string;
  profile_image_path?: string;
  created_ts: number;
  depth: number;
  likes_count: number;
  liked: boolean;
  is_deleted: boolean;
  media?: Array<{
    provider: string;
    provider_id: string;
    url: string;
    content_type: string;
  }>;
  parent_comment_id?: string;
};

export type KalshiPost = {
  id: string;
  social_id: string;
  market_title: string;
  event_title: string;
  event_long_title: string;
  series_title: string;
  market_ticker: string;
  event_ticker: string;
  series_tickers: string[];
  nickname: string;
  post_type: string;
  content: string;
  image_paths?: string[] | null;
  media?: Array<{
    provider: string;
    provider_id: string;
    url: string;
    content_type: string;
  }> | null;
  side: string;
  likes_count: number;
  comments_count: number;
  bookmarks_count: number;
  liked: boolean;
  bookmarked: boolean;
  created_ts: number;
  profile_image_path?: string;
  comments?: KalshiComment[];
};

type UseKalshiCommentsParams = {
  eventTicker?: string;
  limit?: number;
  includeComments?: boolean;
  commentsMaxDepth?: number;
};

export function useKalshiComments({
  eventTicker,
  limit = 20,
  includeComments = true,
  commentsMaxDepth = 3,
}: UseKalshiCommentsParams) {
  return useQuery({
    queryKey: ["kalshi-comments", eventTicker, limit, includeComments, commentsMaxDepth],
    queryFn: async () => {
      if (!eventTicker) return null;

      const params = new URLSearchParams({
        event_ticker: eventTicker,
        limit: limit.toString(),
        include_comments: includeComments.toString(),
        comments_max_depth: commentsMaxDepth.toString(),
      });

      const res = await fetch(
        `/api/kalshi/comments?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Kalshi comments fetch error:", errorText);
        throw new Error(`Failed to fetch comments: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      return data as { posts: KalshiPost[]; cursor?: string };
    },
    enabled: !!eventTicker,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

"use client";

import { useState, useMemo } from "react";
import { useKalshiComments, type KalshiComment, type KalshiPost } from "@/hooks/useKalshiComments";
import HolderAvatar from "../../../PolymarketTradingInterface/components/shared/HolderAvatar";

type KalshiCommentsProps = {
  eventTicker?: string;
};

function getTimeAgo(timestamp: number): string {
  // Kalshi timestamps are in nanoseconds (divide by 1e6 to get milliseconds)
  const date = new Date(timestamp / 1e6);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffInSeconds / 86400);
  return `${days}d ago`;
}

function CommentItem({
  comment,
  replies,
  level = 0,
}: {
  comment: KalshiComment;
  replies: KalshiComment[];
  level?: number;
}) {
  const [showReplies, setShowReplies] = useState(level === 0);
  const [isLiked, setIsLiked] = useState(comment.liked || false);

  const timeAgo = getTimeAgo(comment.created_ts);
  const displayName = comment.nickname || "Anonymous";

  const nestedReplies = replies.filter(
    (r) => r && r.parent_comment_id === comment.id
  );

  const hasReplies = nestedReplies.length > 0;
  const reactionCount = comment.likes_count || 0;

  return (
    <div className={`${level > 0 ? "ml-8 mt-3" : ""}`}>
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <HolderAvatar
            name={displayName}
            profileImage={
              typeof comment.profile_image_path === "string"
                ? comment.profile_image_path
                : undefined
            }
            size={32}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white">
              {displayName}
            </span>
            <span className="text-xs text-white/60">{timeAgo}</span>
          </div>
          {comment.content &&
            typeof comment.content === "string" &&
            comment.content.trim() && (
              <p className="text-sm text-white/90 mb-2 whitespace-pre-wrap break-words">
                {comment.content}
              </p>
            )}
          {comment.media &&
            Array.isArray(comment.media) &&
            comment.media.length > 0 && (
              <div className="mb-2">
                {comment.media.map((media, idx) => {
                  if (
                    !media ||
                    typeof media !== "object" ||
                    typeof media.url !== "string"
                  ) {
                    return null;
                  }
                  return (
                    <img
                      key={idx}
                      src={media.url}
                      alt="Media"
                      className="max-w-full rounded"
                    />
                  );
                })}
              </div>
            )}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={isLiked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>{reactionCount + (isLiked ? 1 : 0)}</span>
            </button>
            <button className="text-xs text-white/60 hover:text-white transition-colors">
              Reply
            </button>
            {hasReplies && level === 0 && (
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="text-xs text-white/60 hover:text-white transition-colors"
              >
                {showReplies ? "Hide" : "Show"} {nestedReplies.length}{" "}
                {nestedReplies.length === 1 ? "Reply" : "Replies"}
              </button>
            )}
          </div>
          {showReplies && hasReplies && (
            <div className="mt-3 space-y-0">
              {nestedReplies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  replies={replies}
                  level={level + 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostItem({ post }: { post: KalshiPost }) {
  const [isLiked, setIsLiked] = useState(post.liked || false);
  const timeAgo = getTimeAgo(post.created_ts);
  const displayName = post.nickname || "Anonymous";

  // Get all comments for this post (including nested)
  const allComments = Array.isArray(post.comments) ? post.comments : [];
  const topLevelComments = allComments.filter((c) => c && c.depth === 0);

  return (
    <div className="pb-4 border-b border-white/10 last:border-b-0">
      <div className="flex gap-3 mb-3">
        <div className="flex-shrink-0">
          <HolderAvatar
            name={displayName}
            profileImage={
              typeof post.profile_image_path === "string"
                ? post.profile_image_path
                : undefined
            }
            size={40}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white">
              {displayName}
            </span>
            <span className="text-xs text-white/60">{timeAgo}</span>
            {post.market_title &&
              typeof post.market_title === "string" &&
              post.market_title.trim() && (
                <span className="text-xs text-white/40">
                  • {post.market_title}
                </span>
              )}
          </div>
          {post.content &&
            typeof post.content === "string" &&
            post.content.trim() && (
              <p className="text-sm text-white/90 mb-2 whitespace-pre-wrap break-words">
                {post.content}
              </p>
            )}
          {post.media &&
            Array.isArray(post.media) &&
            post.media.length > 0 && (
              <div className="mb-2">
                {post.media.map((media, idx) => {
                  if (
                    !media ||
                    typeof media !== "object" ||
                    typeof media.url !== "string"
                  ) {
                    return null;
                  }
                  return (
                    <img
                      key={idx}
                      src={media.url}
                      alt="Media"
                      className="max-w-full rounded"
                    />
                  );
                })}
              </div>
            )}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={isLiked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>{post.likes_count + (isLiked ? 1 : 0)}</span>
            </button>
            <button className="text-xs text-white/60 hover:text-white transition-colors">
              Comment
            </button>
          </div>
        </div>
      </div>
      {topLevelComments.length > 0 && (
        <div className="ml-12 mt-3 space-y-3">
          {topLevelComments
            .filter((comment) => comment && comment.id)
            .map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={allComments}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export default function KalshiComments({ eventTicker }: KalshiCommentsProps) {
  const { data: commentsData, isLoading } = useKalshiComments({
    eventTicker,
    limit: 20,
    includeComments: true,
    commentsMaxDepth: 3,
  });

  const posts = useMemo(() => {
    if (!commentsData?.posts) return [];
    // Ensure posts is an array
    if (!Array.isArray(commentsData.posts)) {
      console.warn("Kalshi comments posts is not an array:", commentsData.posts);
      return [];
    }
    // Filter out any invalid posts
    return commentsData.posts.filter(
      (post) => post && typeof post === "object" && post.id
    );
  }, [commentsData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-white/60">Loading comments...</div>
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="text-sm text-white/60 mb-2">No comments yet</div>
        <div className="text-xs text-white/40">Be the first to comment!</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-1">
      {posts
        .filter((post) => post && post.id)
        .map((post) => (
          <PostItem key={post.id} post={post} />
        ))}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useKalshiComments, type KalshiComment, type KalshiPost } from "@/hooks/useKalshiComments";
import HolderAvatar from "../../../PolymarketTradingInterface/components/shared/HolderAvatar";
import { IconHeart } from "../../../shared/marketUi";

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

function MediaList({ media }: { media?: Array<{ url: string }> | null }) {
  if (!media || !Array.isArray(media) || media.length === 0) return null;
  return (
    <div className="mk-media">
      {media.map((item, idx) => {
        if (!item || typeof item !== "object" || typeof item.url !== "string") {
          return null;
        }
        return <img key={idx} src={item.url} alt="Media" />;
      })}
    </div>
  );
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
    <div className="mk-cmt">
      <div className="mk-cmt-row">
        <HolderAvatar
          name={displayName}
          profileImage={
            typeof comment.profile_image_path === "string"
              ? comment.profile_image_path
              : undefined
          }
          size={32}
          tone="gold"
        />
        <div className="mk-cmt-main">
          <div className="mk-meta">
            <span className="mk-who">{displayName}</span>
            <span className="mk-time">{timeAgo}</span>
          </div>
          {comment.content &&
            typeof comment.content === "string" &&
            comment.content.trim() && (
              <p className="mk-text">{comment.content}</p>
            )}
          <MediaList media={comment.media} />
          <div className="mk-acts">
            <button
              type="button"
              onClick={() => setIsLiked(!isLiked)}
              aria-pressed={isLiked}
              aria-label={`Like, ${reactionCount + (isLiked ? 1 : 0)} likes`}
            >
              <IconHeart size={14} filled={isLiked} />
              <span className="rx-num">{reactionCount + (isLiked ? 1 : 0)}</span>
            </button>
            <button type="button">Reply</button>
            {hasReplies && level === 0 && (
              <button
                type="button"
                onClick={() => setShowReplies(!showReplies)}
                aria-expanded={showReplies}
              >
                {showReplies ? "Hide" : "Show"} {nestedReplies.length}{" "}
                {nestedReplies.length === 1 ? "Reply" : "Replies"}
              </button>
            )}
          </div>
          {showReplies && hasReplies && (
            <div className="mk-replies">
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
    <article className="mk-post">
      <div className="mk-cmt-row">
        <HolderAvatar
          name={displayName}
          profileImage={
            typeof post.profile_image_path === "string"
              ? post.profile_image_path
              : undefined
          }
          size={40}
          tone="gold"
        />
        <div className="mk-cmt-main">
          <div className="mk-meta">
            <span className="mk-who">{displayName}</span>
            <span className="mk-time">{timeAgo}</span>
            {post.market_title &&
              typeof post.market_title === "string" &&
              post.market_title.trim() && (
                <span className="mk-topic">· {post.market_title}</span>
              )}
          </div>
          {post.content &&
            typeof post.content === "string" &&
            post.content.trim() && <p className="mk-text">{post.content}</p>}
          <MediaList media={post.media} />
          <div className="mk-acts">
            <button
              type="button"
              onClick={() => setIsLiked(!isLiked)}
              aria-pressed={isLiked}
              aria-label={`Like, ${post.likes_count + (isLiked ? 1 : 0)} likes`}
            >
              <IconHeart size={14} filled={isLiked} />
              <span className="rx-num">{post.likes_count + (isLiked ? 1 : 0)}</span>
            </button>
            <button type="button">Comment</button>
          </div>
        </div>
      </div>
      {topLevelComments.length > 0 && (
        <div className="mk-replies">
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
    </article>
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
      <div className="mk-msg" role="status">
        Loading comments...
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="mk-msg">
        <b>No comments yet</b>
        Be the first to comment!
      </div>
    );
  }

  return (
    <div className="mk-posts">
      {posts
        .filter((post) => post && post.id)
        .map((post) => (
          <PostItem key={post.id} post={post} />
        ))}
    </div>
  );
}

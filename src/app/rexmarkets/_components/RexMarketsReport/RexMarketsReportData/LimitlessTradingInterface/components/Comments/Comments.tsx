"use client";

import { useLimitlessComments, type LimitlessComment } from "@/hooks/useLimitlessComments";
import { formatAddress } from "@/utils/polymarketTrading";
import HolderAvatar from "../../../PolymarketTradingInterface/components/shared/HolderAvatar";

type CommentsProps = {
  marketSlug: string | null;
};

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

function CommentItem({ comment }: { comment: LimitlessComment }) {
  const rawDate = comment.created_at ?? comment.created_at_ts;
  const createdAt = rawDate ? (typeof rawDate === "number" ? new Date(rawDate * 1000) : new Date(rawDate)) : new Date();
  const timeAgo = getTimeAgo(createdAt);
  const displayName = comment.username || (comment.user ? formatAddress(comment.user) : "Anonymous");
  const body = comment.content ?? (comment as any).body ?? "";

  return (
    <article className="mk-post">
      <div className="mk-cmt-row">
        <HolderAvatar name={displayName} size={32} tone="gold" />
        <div className="mk-cmt-main">
          <div className="mk-meta">
            <span className="mk-who">{displayName}</span>
            <span className="mk-time">{timeAgo}</span>
          </div>
          <p className="mk-text">{body}</p>
        </div>
      </div>
    </article>
  );
}

export default function Comments({ marketSlug }: CommentsProps) {
  const { data, isLoading } = useLimitlessComments(marketSlug ?? null, 1, 20);
  const comments = data?.comments ?? [];

  if (isLoading) {
    return (
      <div className="mk-msg" role="status">
        Loading comments...
      </div>
    );
  }

  if (!comments.length) {
    return (
      <div className="mk-msg">
        <b>No comments yet</b>
        Be the first to comment!
      </div>
    );
  }

  return (
    <div className="mk-posts">
      {comments.map((comment, idx) => (
        <CommentItem key={(comment as any).id ?? `c-${idx}`} comment={comment} />
      ))}
    </div>
  );
}

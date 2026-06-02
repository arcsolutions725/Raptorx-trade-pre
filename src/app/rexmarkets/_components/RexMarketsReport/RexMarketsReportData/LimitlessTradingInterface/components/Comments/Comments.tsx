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
    <div className="flex gap-3 pb-4 border-b border-white/10 last:border-b-0">
      <div className="flex-shrink-0">
        <HolderAvatar name={displayName} size={32} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white truncate">{displayName}</span>
          <span className="text-xs text-white/60 flex-shrink-0">{timeAgo}</span>
        </div>
        <p className="text-sm text-white/90 whitespace-pre-wrap break-words">{body}</p>
      </div>
    </div>
  );
}

export default function Comments({ marketSlug }: CommentsProps) {
  const { data, isLoading } = useLimitlessComments(marketSlug ?? null, 1, 20);
  const comments = data?.comments ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-white/60">Loading comments...</div>
      </div>
    );
  }

  if (!comments.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="text-sm text-white/60 mb-2">No comments yet</div>
        <div className="text-xs text-white/40">Be the first to comment!</div>
      </div>
    );
  }

  return (
    <div className="space-y-0 px-1">
      {comments.map((comment, idx) => (
        <CommentItem key={(comment as any).id ?? `c-${idx}`} comment={comment} />
      ))}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { usePolymarketComments, type PolymarketComment } from "@/hooks/usePolymarketComments";
import { formatAddress } from "@/utils/polymarketTrading";
import HolderAvatar from "../shared/HolderAvatar";

type CommentsProps = {
  marketId?: string | null;
  eventId?: string | null;
  seriesId?: string | null;
};

function getTimeAgo(date: Date): string {
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
  comment: PolymarketComment;
  replies: PolymarketComment[];
  level?: number;
}) {
  const [showReplies, setShowReplies] = useState(level === 0);
  const [isLiked, setIsLiked] = useState(false);

  const createdAt = new Date(comment.createdAt);
  const timeAgo = getTimeAgo(createdAt);

  // If name starts with "0x", use pseudonym instead (if available)
  const displayName = useMemo(() => {
    const name = comment.profile?.name;
    const pseudonym = comment.profile?.pseudonym;
    
    // If name exists and starts with "0x", prefer pseudonym
    if (name && name.startsWith("0x")) {
      return pseudonym || formatAddress(comment.profile?.proxyWallet || comment.userAddress);
    }
    
    // Otherwise use the normal priority: name -> pseudonym -> formatted address
    return name || pseudonym || formatAddress(comment.profile?.proxyWallet || comment.userAddress);
  }, [comment.profile?.name, comment.profile?.pseudonym, comment.profile?.proxyWallet, comment.userAddress]);

  const nestedReplies = replies.filter(
    (r) => r.parentCommentID === comment.id
  );

  const hasReplies = nestedReplies.length > 0;
  const reactionCount = comment.reactionCount || comment.reactions?.length || 0;

  return (
    <div className={`${level > 0 ? "ml-8 mt-3" : ""}`}>
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <HolderAvatar
            name={displayName}
            profileImage={comment.profile?.profileImage}
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
          <p className="text-sm text-white/90 mb-2 whitespace-pre-wrap break-words">
            {comment.body}
          </p>
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

export default function Comments({ marketId, eventId, seriesId }: CommentsProps) {
  const { data: comments, isLoading } = usePolymarketComments({
    marketId,
    eventId,
    seriesId,
    limit: 40,
    offset: 0,
    order: "createdAt",
    ascending: false,
    holdersOnly: false,
  });

  // Separate top-level comments and replies
  const { topLevelComments, allComments } = useMemo(() => {
    if (!comments || !Array.isArray(comments)) {
      return { topLevelComments: [], allComments: [] };
    }

    const topLevel = comments.filter((c) => !c.parentCommentID);
    return { topLevelComments: topLevel, allComments: comments };
  }, [comments]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-white/60">Loading comments...</div>
      </div>
    );
  }

  if (!comments || comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="text-sm text-white/60 mb-2">No comments yet</div>
        <div className="text-xs text-white/40">Be the first to comment!</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto custom-select-scrollbar px-1">
      {topLevelComments.map((comment) => (
        <div key={comment.id} className="pb-4 border-b border-white/10 last:border-b-0">
          <CommentItem
            comment={comment}
            replies={allComments}
          />
        </div>
      ))}
    </div>
  );
}


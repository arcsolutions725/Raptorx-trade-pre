"use client";

import { useState, useMemo } from "react";
import { usePolymarketComments, type PolymarketComment } from "@/hooks/usePolymarketComments";
import { formatAddress } from "@/utils/polymarketTrading";
import HolderAvatar from "../shared/HolderAvatar";
import { IconHeart } from "../../../shared/marketUi";

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
  const likes = reactionCount + (isLiked ? 1 : 0);

  return (
    <div className="mk-cmt">
      <div className="mk-cmt-row">
        <HolderAvatar
          name={displayName}
          profileImage={comment.profile?.profileImage}
          size={level === 0 ? 40 : 32}
          tone="gold"
        />
        <div className="mk-cmt-main">
          <div className="mk-meta">
            <span className="mk-who">{displayName}</span>
            <span className="mk-time">{timeAgo}</span>
          </div>
          <p className="mk-text">{comment.body}</p>
          <div className="mk-acts">
            <button
              type="button"
              onClick={() => setIsLiked(!isLiked)}
              aria-pressed={isLiked}
              aria-label={`Like, ${likes} likes`}
            >
              <IconHeart size={14} filled={isLiked} />
              <span className="rx-num">{likes}</span>
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
      <div className="mk-msg" role="status">
        Loading comments...
      </div>
    );
  }

  if (!comments || comments.length === 0) {
    return (
      <div className="mk-msg">
        <b>No comments yet</b>
        Be the first to comment!
      </div>
    );
  }

  return (
    <div className="mk-posts">
      {topLevelComments.map((comment) => (
        <article key={comment.id} className="mk-post">
          <CommentItem
            comment={comment}
            replies={allComments}
          />
        </article>
      ))}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import {
  usePredictFunComments,
  type PredictFunComment,
} from "@/hooks/usePredictFunComments";
import HolderAvatar from "../../PolymarketTradingInterface/components/shared/HolderAvatar";

type PredictFunCommentsProps = {
  categorySlug: string | null;
  marketId: string | null;
};

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

function CommentRow({ comment }: { comment: PredictFunComment }) {
  const createdAt = comment.createdAt ? new Date(comment.createdAt) : null;
  const timeAgo =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? getTimeAgo(createdAt)
      : "";

  const author = comment.author ?? "Trader";

  return (
    <article className="mk-post">
      <div className="mk-cmt-row">
        <HolderAvatar name={comment.author ?? "?"} tone="gold" size={40} />
        <div className="mk-cmt-main">
          <div className="mk-meta">
            <span className="mk-who">{author}</span>
            {comment.positionLabel ? (
              <span className="rx-badge rx-badge--gold">{comment.positionLabel}</span>
            ) : null}
            {timeAgo ? <span className="mk-time">{timeAgo}</span> : null}
          </div>
          <p className="mk-text">{comment.body}</p>
        </div>
      </div>
    </article>
  );
}

export default function PredictFunComments({
  categorySlug,
  marketId,
}: PredictFunCommentsProps) {
  const { data: comments, isLoading } = usePredictFunComments(
    categorySlug,
    marketId,
    !!categorySlug
  );

  const list = useMemo(() => comments ?? [], [comments]);

  if (!categorySlug) {
    return <div className="mk-msg">Comments are not available for this market type.</div>;
  }

  if (isLoading) {
    return (
      <div className="mk-msg" role="status">
        Loading comments…
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="mk-msg">
        <b>No comments yet</b>
        Community comments for this event appear on Predict.fun when available. Trading and
        activity below are scoped to the selected outcome.
      </div>
    );
  }

  return (
    <div className="mk-posts">
      {list.map((comment) => (
        <CommentRow key={comment.id} comment={comment} />
      ))}
    </div>
  );
}

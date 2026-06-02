"use client";

import { useMemo } from "react";
import {
  usePredictFunComments,
  type PredictFunComment,
} from "@/hooks/usePredictFunComments";

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

  return (
    <div className="flex gap-3 py-3 border-b border-white/10 last:border-b-0">
      <div className="w-8 h-8 rounded-full bg-white/10 shrink-0 flex items-center justify-center text-xs text-white/50">
        {(comment.author ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-medium text-white">
            {comment.author ?? "Trader"}
          </span>
          {comment.positionLabel ? (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#A855F7]/20 text-[#D8B4FE]">
              {comment.positionLabel}
            </span>
          ) : null}
          {timeAgo ? <span className="text-xs text-white/50">{timeAgo}</span> : null}
        </div>
        <p className="text-sm text-white/90 whitespace-pre-wrap break-words">
          {comment.body}
        </p>
      </div>
    </div>
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
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="text-sm text-white/60">Comments are not available for this market type.</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-white/60">Loading comments…</div>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="text-sm text-white/60">No comments yet</div>
        <div className="text-xs text-white/40 mt-2 max-w-sm">
          Community comments for this event appear on Predict.fun when available. Trading and
          activity below are scoped to the selected outcome.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0 px-1">
      {list.map((comment) => (
        <CommentRow key={comment.id} comment={comment} />
      ))}
    </div>
  );
}

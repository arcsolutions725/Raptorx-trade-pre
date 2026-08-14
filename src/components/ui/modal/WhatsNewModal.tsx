"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, Heart, Repeat2, Eye } from "lucide-react";
import type { WhatsNewTweet } from "@/lib/api/tweetQuality";
import type { ProjectSocialLinks } from "@/lib/api/projectSocials";
import { ProjectSocialLinks as SocialLinks } from "@/components/ui/ProjectSocialLinks";

export type WhatsNewResult = {
  summary: string;
  tweets: WhatsNewTweet[];
  metadata?: {
    contractAddress: string;
    ticker: string;
    projectName?: string | null;
    generatedAt?: string;
    links?: ProjectSocialLinks;
  };
};

type Props = {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  result: WhatsNewResult | null;
  fallbackLinks?: ProjectSocialLinks | null;
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function parseTweetDate(raw: string): Date | null {
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    const fromNumber = new Date(ms);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber;
  }
  const fromString = new Date(raw);
  return Number.isNaN(fromString.getTime()) ? null : fromString;
}

/** Relative tweet age: "22 mins ago", "1 hr ago". */
function formatTweetAge(createdAt: string): string {
  const date = parseTweetDate(createdAt);
  if (!date) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hr ago" : `${hours} hrs ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 wk ago" : `${weeks} wks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 mo ago" : `${months} mos ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 yr ago" : `${years} yrs ago`;
}

export function WhatsNewModal({
  open,
  onClose,
  loading = false,
  error = null,
  result,
  fallbackLinks = null,
}: Props) {
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onKeyDown]);

  if (!open || typeof document === "undefined") return null;

  const title =
    result?.metadata?.projectName ||
    result?.metadata?.ticker ||
    "What's New";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="What's New report"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(88dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121212] shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#dc143c]">
              What&apos;s New
            </div>
            <div className="truncate text-sm font-bold text-white">
              {loading ? "Fetching latest chatter…" : title}
              {result?.metadata?.ticker ? (
                <span className="ml-1.5 font-semibold text-white/50">
                  ${result.metadata.ticker}
                </span>
              ) : null}
            </div>
            <SocialLinks
              links={result?.metadata?.links || fallbackLinks || undefined}
              className="mt-1.5"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close What's New"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/60">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#dc143c] border-t-transparent" />
              <p className="text-sm">Pulling top tweets & summarizing…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : result ? (
            <div className="flex flex-col gap-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                  Interpretation
                </h3>
                <p className="text-[14px] leading-relaxed text-white/90">
                  {result.summary}
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                  {result.tweets.length > 0
                    ? `Top ${result.tweets.length} tweets`
                    : "Top tweets"}
                </h3>
                {result.tweets.length === 0 ? (
                  <p className="text-sm text-white/50">
                    No recent tweets found for this ticker right now.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {result.tweets.map((t) => {
                      const tweetAge = formatTweetAge(t.createdAt);
                      return (
                        <li
                          key={t.id || t.url || t.text.slice(0, 24)}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-3"
                        >
                          <div className="mb-1.5 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white">
                                {t.tweeter.name}
                                {t.tweeter.isBlueVerified ? (
                                  <span className="ml-1 text-[10px] text-sky-400">
                                    ✓
                                  </span>
                                ) : null}
                              </div>
                              <div className="truncate text-xs text-white/45">
                                @{t.tweeter.username}
                                {t.tweeter.followers > 0
                                  ? ` · ${formatCount(t.tweeter.followers)} followers`
                                  : ""}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1 pt-0.5">
                              {tweetAge ? (
                                <span className="whitespace-nowrap text-[11px] text-white/45">
                                  {tweetAge}
                                </span>
                              ) : null}
                              {t.url ? (
                                <a
                                  href={t.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md p-1 text-[#dc143c] hover:bg-white/5"
                                  aria-label="Open tweet"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                          <p className="whitespace-pre-wrap text-[13px] leading-snug text-white/85">
                            {t.text}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/40">
                            <span className="inline-flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {formatCount(t.likeCount)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Repeat2 className="h-3 w-3" />
                              {formatCount(t.retweetCount)}
                            </span>
                            {t.viewCount > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {formatCount(t.viewCount)}
                              </span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

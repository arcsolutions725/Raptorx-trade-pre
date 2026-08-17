"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, Repeat2, Eye, BadgeCheck } from "lucide-react";
import type { WhatsNewTweet } from "@/lib/api/tweetQuality";
import type { ProjectSocialLinks } from "@/lib/api/projectSocials";

export type WhatsNewParagraph = { title: string; body: string };

export type WhatsNewResult = {
  summary: string;
  paragraphs?: WhatsNewParagraph[];
  tweets: WhatsNewTweet[];
  metadata?: {
    contractAddress: string;
    ticker: string;
    projectName?: string | null;
    generatedAt?: string;
    links?: ProjectSocialLinks;
    imageUrl?: string | null;
  };
};

type Props = {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  result: WhatsNewResult | null;
  fallbackLinks?: ProjectSocialLinks | null;
  imageUrl?: string | null;
};

const GOLD = "#FFD700";

/** Icons from `public/images/what'snew` (spaces + apostrophe encoded). */
const wn = (file: string) => encodeURI(`/images/what'snew/${file}`);

const ICONS = {
  browser: wn("Browser Logo.png"),
  telegram: wn("Telegram Logo.png"),
  x: wn("X Logo.png"),
  reddit: wn("Reddit Logo.png"),
  check: wn("Green Check mark Logo.png"),
  cross: wn("Red Cross Logo.png"),
  hand: wn("Hand Emoji.png"),
  heart: wn("Heart Button Logo.png"),
  link: wn("Orange Color Link Logo.png"),
  rexTwitter: wn("Rex Twitter Logo.png"),
  rex: wn("Orange Rex Logo.png"),
};

const SOCIAL_SLOTS: {
  key: keyof ProjectSocialLinks;
  label: string;
  icon: string;
}[] = [
  { key: "website", label: "Website", icon: ICONS.browser },
  { key: "telegram", label: "Telegram", icon: ICONS.telegram },
  { key: "twitter", label: "X", icon: ICONS.x },
  { key: "reddit", label: "Reddit", icon: ICONS.reddit },
];

function WhatsNewHeading({ className }: { className?: string }) {
  return (
    <span className={className}>
      What&apos;s <span className="text-[#FFD700]">New</span>
    </span>
  );
}

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

function paragraphsFromResult(result: WhatsNewResult): WhatsNewParagraph[] {
  if (result.paragraphs?.length) return result.paragraphs;
  const text = (result.summary || "").trim();
  if (!text) return [];
  return [{ title: "What's happening", body: text }];
}

function SocialStatusBar({ links }: { links?: ProjectSocialLinks | null }) {
  return (
    <div className="flex items-center justify-center gap-[10px]">
      {SOCIAL_SLOTS.map((slot) => {
        const href = links?.[slot.key];
        const present = Boolean(href);
        const inner = (
          <span className="relative inline-flex h-6 w-6 items-center justify-center">
            <Image
              src={slot.icon}
              alt={slot.label}
              width={24}
              height={24}
              className={`h-6 w-6 object-contain ${present ? "" : "opacity-55"}`}
            />
            <Image
              src={present ? ICONS.check : ICONS.cross}
              alt={present ? "Available" : "Missing"}
              width={12}
              height={12}
              className="absolute -right-1 -top-1 h-3 w-3 object-contain"
            />
          </span>
        );
        if (!href) {
          return (
            <span key={slot.key} title={`${slot.label} not listed`}>
              {inner}
            </span>
          );
        }
        return (
          <a
            key={slot.key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={slot.label}
            aria-label={slot.label}
            className="rounded-md transition hover:opacity-90"
          >
            {inner}
          </a>
        );
      })}
    </div>
  );
}

export function WhatsNewModal({
  open,
  onClose,
  loading = false,
  error = null,
  result,
  fallbackLinks = null,
  imageUrl = null,
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

  const projectName = result?.metadata?.projectName || "";
  const ticker = result?.metadata?.ticker || "";
  const logoSrc = result?.metadata?.imageUrl || imageUrl || "";
  const links = result?.metadata?.links || fallbackLinks || undefined;
  const paragraphs = result ? paragraphsFromResult(result) : [];

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
      <div className="whats-new-modal relative z-10 flex max-h-[min(88dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121212] shadow-2xl shadow-black/60">
        {loading ? (
          <div className="relative flex items-center justify-center border-b border-white/10 px-4 py-3.5">
            <h2 className="whats-new-title text-white">
              <WhatsNewHeading />
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Close What's New"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : result ? (
          <div className="border-b border-white/10 px-3.5 py-3">
            <div className="flex items-center gap-3">
              {logoSrc ? (
                <Image
                  src={logoSrc}
                  alt=""
                  width={90}
                  height={90}
                  className="h-[90px] w-[90px] shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-[90px] w-[90px] shrink-0 items-center justify-center rounded-full bg-white/10 text-2xl font-bold text-white/70">
                  {(ticker || projectName || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1 text-center">
                <div className="whats-new-title truncate leading-tight">
                  <span className="text-white">
                    {projectName || ticker || "What's New"}
                  </span>
                  {ticker ? (
                    <span className="ml-1.5" style={{ color: GOLD }}>
                      ${ticker}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4">
                  <SocialStatusBar links={links} />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="self-start shrink-0 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Close What's New"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex items-center justify-center border-b border-white/10 px-4 py-3.5">
            <h2 className="whats-new-title text-white">
              <WhatsNewHeading />
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Close What's New"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 py-10">
              <Image
                src={ICONS.rex}
                alt="Rex reviewing the market"
                width={88}
                height={94}
                className="whats-new-mascot-bounce h-auto w-[72px] object-contain"
                priority
              />
              <p className="text-center text-[16px] font-bold text-[#FFD700]">
                We&apos;re digging into what the market is saying
                <span className="whats-new-ellipsis" aria-hidden />
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : result ? (
            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-3.5">
                {paragraphs.map((p, i) => (
                  <div key={`${p.title}-${i}`} className="flex items-start gap-2">
                    <Image
                      src={ICONS.hand}
                      alt=""
                      width={22}
                      height={18}
                      className="mt-0.5 h-[18px] w-[22px] shrink-0 object-contain"
                    />
                    <p className="min-w-0 text-[13.5px] leading-relaxed text-white">
                      <span className="font-bold" style={{ color: GOLD }}>
                        {p.title.replace(/\.*$/, ".")}
                      </span>
                      <span className="text-white"> {p.body}</span>
                    </p>
                  </div>
                ))}
              </section>

              <section className="flex flex-col items-center gap-2" style={{ paddingTop: '30px' }}>
                <div className="relative flex w-full items-center justify-center py-1">
                  <Image
                    src={ICONS.rexTwitter}
                    alt=""
                    width={56}
                    height={56}
                    className="absolute left-0 h-14 w-14 object-contain"
                  />
                  <h3 className="whats-new-title">
                    <span style={{ color: GOLD }}>Top</span>{" "}
                    <span className="text-white">Tweets</span>
                  </h3>
                </div>
                {result.tweets.length === 0 ? (
                  <p className="text-sm text-white/50">
                    No recent tweets found for this ticker right now.
                  </p>
                ) : (
                  <ul className="mt-1 flex w-full flex-col gap-3">
                    {result.tweets.map((t) => {
                      const tweetAge = formatTweetAge(t.createdAt);
                      const avatar = t.tweeter.publicImageUrl;
                      return (
                        <li
                          key={t.id || t.url || t.text.slice(0, 24)}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-3"
                        >
                          <div className="mb-1.5 flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              {avatar ? (
                                <Image
                                  src={avatar}
                                  alt=""
                                  width={36}
                                  height={36}
                                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">
                                  {(t.tweeter.name || "?").slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-white">
                                  <span className="truncate">{t.tweeter.name}</span>
                                  {t.tweeter.isBlueVerified ? (
                                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-sky-400 text-white" />
                                  ) : null}
                                  {t.tweeter.followers > 0 ? (
                                    <span className="shrink-0 text-[11px] font-medium text-[#FFD700]">
                                      {formatCount(t.tweeter.followers)} followers
                                    </span>
                                  ) : null}
                                </div>
                                <div className="truncate text-xs text-white/45">
                                  @{t.tweeter.username}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1 pt-0.5">
                              {tweetAge ? (
                                <span className="whitespace-nowrap text-[11px] font-medium text-[#FFD700]">
                                  {tweetAge}
                                </span>
                              ) : null}
                              {t.url ? (
                                <a
                                  href={t.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md p-0.5 hover:bg-white/5"
                                  aria-label="Open tweet"
                                >
                                  <Image
                                    src={ICONS.link}
                                    alt=""
                                    width={22}
                                    height={22}
                                    className="h-[22px] w-[22px] object-contain"
                                  />
                                </a>
                              ) : null}
                            </div>
                          </div>
                          <p className="whitespace-pre-wrap text-[13px] leading-snug text-white">
                            {t.text}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/45">
                            <span className="inline-flex items-center gap-1 font-medium text-red-500">
                              <Image
                                src={ICONS.heart}
                                alt=""
                                width={14}
                                height={14}
                                className="h-3.5 w-3.5 object-contain"
                              />
                              {formatCount(t.likeCount)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Repeat2 className="h-3.5 w-3.5" />
                              {formatCount(t.retweetCount)}
                            </span>
                            {t.viewCount > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <Eye className="h-3.5 w-3.5" />
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

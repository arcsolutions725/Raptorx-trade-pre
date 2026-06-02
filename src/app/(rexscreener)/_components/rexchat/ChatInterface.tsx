/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import {
  Check,
  RotateCcw,
  ArrowLeft,
  Square,
  X,
} from "lucide-react";
import copy from "copy-to-clipboard";
import {
  parseRexScreenerReportSections,
  displayReportSectionTitle,
  type RexReportSection,
} from "@/lib/reportToc";
import {
  mergeGoldenTeamUpdatesSections,
} from "@/lib/goldenReportTeamUpdate";
import { ReportMenuDropdown } from "@/components/report/ReportMenuDropdown";
import {
  useReportWithConversation,
  useAppendMessage,
} from "@/hooks/useReports";
import { useRegenerateReport } from "@/hooks/useRegenerateReport";
import { PaywallModal, type PaywallLimitCode } from "@/components/ui/modal/PaywallModal";
import { CoinOMetry } from "@/components/CoinOMetry";
import { HolderAnalyticsComponent } from "@/components/analytics/HolderAnalytics";
import { BirdeyeSafetyAnalyticsComponent } from "@/components/analytics/BirdeyeSafetyAnalytics";
import type { HolderAnalytics } from "@/lib/api/bnbAnalytics";
import type { SecurityAnalytics } from "@/lib/api/birdeyeSecurtiy";
import { formatRexPilotChatLines } from "@/lib/formatRexPilotChatLines";
import { useMarketReportStream } from "@/lib/storage/marketReportStreamStore";
import { isBscForBnbAnalyticsSections } from "@/utils/detectChain";
import {
  getRexPilotReportSectionIcon,
  renderRexPilotMarkdownSection,
} from "./rexPilotReportMarkdown";
import { PilotReportHistoryButton } from "./PilotReportHistoryButton";

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative?: string;
  priceUsd?: string;
  volume?: { h24: number; h6: number; h1: number; m5?: number };
  liquidity?: { usd: number; base: number; quote: number };
  txns?: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h6?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}
function isDexScreenerPair(data: unknown): data is DexScreenerPair {
  if (!data || typeof data !== "object") return false;
  const o = data as any;
  return o?.baseToken?.symbol && o?.quoteToken?.symbol;
}

// type MessageRole = "user" | "assistant";
type Props = {
  userId: string;
  reportId: string;
  /** Optional: navigate back to analysis / indicator view */
  onBack?: () => void;
  /** Optional: callback to open report history */
  onViewHistory?: () => void;
  /** For history button aria-label; defaults to 0. */
  reportHistoryCount?: number;
  /** When set, shows close in the top bar (same row as Back / history) instead of only the floating shell control. */
  onCloseSidebar?: () => void;
};

function PilotSessionTopChrome({
  onBack,
  onViewHistory,
  onCloseSidebar,
  reportHistoryCount,
}: {
  onBack?: () => void;
  onViewHistory?: () => void;
  onCloseSidebar?: () => void;
  reportHistoryCount: number;
}) {
  if (!onBack && !onViewHistory && !onCloseSidebar) return null;
  return (
    <div className="z-40 flex w-full shrink-0 items-center justify-between gap-2 bg-transparent px-3 py-2 sm:px-4">
      <div className="flex min-w-0 flex-1 justify-start">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex cursor-pointer items-center gap-2 text-white/70 transition hover:text-white"
            aria-label="Back to Generate Report"
            title="Back"
          >
            <ArrowLeft className="h-6 w-6 shrink-0" />
            <span className="text-lg">Back</span>
          </button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {onViewHistory ? (
          <PilotReportHistoryButton
            count={reportHistoryCount}
            onOpen={onViewHistory}
            className="shrink-0 [&_img]:!h-9 [&_img]:!w-auto [&_img]:max-h-9"
          />
        ) : null}
        {onCloseSidebar ? (
          <button
            type="button"
            onClick={onCloseSidebar}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#3C3C3C] text-white transition-colors hover:bg-[#4C4C4C]"
            aria-label="Close sidebar"
            title="Close"
          >
            <X width={16} height={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

const COPY_MS = 500;
const MAX_H = 200;

const TOP_TWEETS_FETCH_COUNTDOWN_SEC = 20;

export default function ChatInterface({
  userId,
  reportId,
  onBack,
  onViewHistory,
  reportHistoryCount = 0,
  onCloseSidebar,
}: Props) {
  const {
    data: reportData,
    isLoading,
    isFetching,
    refetch,
  } = useReportWithConversation(userId, reportId);
  const queryClient = useQueryClient();
  const appendMessage = useAppendMessage(userId);

  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLimitCode, setPaywallLimitCode] = useState<PaywallLimitCode | null>(null);

  // BNB Analytics state - now using stored data with fallback to API
  const [holderAnalytics, setHolderAnalytics] =
    useState<HolderAnalytics | null>(null);
  const [securityAnalytics, setSecurityAnalytics] =
    useState<SecurityAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  /** True while POST /api/reports/.../refresh-tweets runs (server calls getTweetsSearch in lib/api/tweet.ts). */
  const [isRefreshingTweets, setIsRefreshingTweets] = useState(false);

  // Regenerate state
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasRegenerated, setHasRegenerated] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topTweetsCountdownIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const regenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [topTweetsFetchCountdown, setTopTweetsFetchCountdown] = useState(
    TOP_TWEETS_FETCH_COUNTDOWN_SEC,
  );

  /** Published Golden Report team copy for this report’s contract (injected before “What It Is”). */
  const [goldenPublic, setGoldenPublic] = useState<{
    eligible: boolean;
    content: string;
    publishedAt: string | null;
  } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const hadStreamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check if user is near bottom of scroll container
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return false;
    const threshold = 100; // pixels from bottom
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
    return isNearBottom;
  }, []);

  // Handle scroll events to track if user manually scrolled
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      shouldAutoScrollRef.current = checkIfNearBottom();
    }
  }, [checkIfNearBottom]);

  // Attach scroll listener to the scroll container
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  useEffect(() => {
    // Only auto-scroll when user sent a message and is near bottom — do not scroll during or after AI answer generation
    if (!shouldAutoScroll) return;
    if (!shouldAutoScrollRef.current) return;
    if (streamingContent) {
      hadStreamingRef.current = true;
      return;
    }
    if (hadStreamingRef.current) {
      hadStreamingRef.current = false;
      return;
    }

    const rafId = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    reportData?.conversation?.messages?.length,
    streamingContent,
    shouldAutoScroll,
  ]);

  // When switching conversations (e.g., via chat history), do not auto-scroll initially
  useEffect(() => {
    setShouldAutoScroll(false);
  }, [reportId]);

  // Do not auto-scroll when answer generation finishes — let the user scroll manually

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = `${Math.min(
        taRef.current.scrollHeight,
        MAX_H
      )}px`;
    }
  }, [inputMessage]);

  const dexData: DexScreenerPair | undefined = useMemo(() => {
    const dd = reportData?.dexData as unknown;
    return isDexScreenerPair(dd) ? (dd as DexScreenerPair) : undefined;
  }, [reportData?.dexData]);

  const isBNBToken = useMemo(
    () =>
      isBscForBnbAnalyticsSections({
        explicitChain: reportData?.chain,
        dexData: reportData?.dexData,
        contractAddress: reportData?.contractAddress,
      }),
    [reportData?.chain, reportData?.dexData, reportData?.contractAddress],
  );

  const { partialText, isStreamForKey } = useMarketReportStream(
    reportData?.contractAddress ?? null,
  );

  // Load BNB analytics - use stored data from reports, eliminating API calls
  useEffect(() => {
    if (!reportData?.contractAddress || !isBNBToken) {
      setHolderAnalytics(null);
      setSecurityAnalytics(null);
      setAnalyticsLoading(false);
      return;
    }

    const loadBNBAnalytics = () => {
      setAnalyticsLoading(true);

      // Use stored data from the report (no API fallback needed)
      const storedHolderData = reportData.holdersData;
      const storedSecurityData = reportData.securityData;

      if (storedHolderData) {
        setHolderAnalytics(storedHolderData);
      } else {
        setHolderAnalytics(null);
      }

      if (storedSecurityData) {
        setSecurityAnalytics(storedSecurityData);
      } else {
        setSecurityAnalytics(null);
      }

      setAnalyticsLoading(false);
    };

    loadBNBAnalytics();
  }, [
    reportData?.contractAddress,
    reportData?.holdersData,
    reportData?.securityData,
    isBNBToken,
  ]);

  useEffect(() => {
    const addr = reportData?.contractAddress;
    const chain = (reportData?.chain as string) || "solana";
    if (!addr) {
      setGoldenPublic(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const u = new URL(
          "/api/golden-reports/team-updates/public",
          window.location.origin,
        );
        u.searchParams.set("contractAddress", addr);
        u.searchParams.set("chain", chain);
        const res = await fetch(u.toString());
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (j?.ok) {
          setGoldenPublic({
            eligible: Boolean(j.eligible),
            content: typeof j.content === "string" ? j.content : "",
            publishedAt:
              typeof j.publishedAt === "string" ? j.publishedAt : null,
          });
        } else {
          setGoldenPublic({
            eligible: false,
            content: "",
            publishedAt: null,
          });
        }
      } catch {
        if (!cancelled) {
          setGoldenPublic({
            eligible: false,
            content: "",
            publishedAt: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportData?.contractAddress, reportData?.chain]);

  /* ---------------------------------------------------------------------- */
  /* Timestamp helper                                                       */
  /* ---------------------------------------------------------------------- */
  function formatRelativeTime(iso: string | Date): string {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffSec < 60) return "Updated just now";
    if (diffMin < 60) return `Updated ${diffMin} min ago`;
    if (diffHr < 24)
      return `Updated ${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
    if (diffDay < 7)
      return `Updated ${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
    return `Updated on ${d.toLocaleDateString()} at ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  /* ---------------------------------------------------------------------- */
  /* Regenerate logic                                                       */
  /* ---------------------------------------------------------------------- */
  const {
    isRegenerating,
    error: regenerateError,
    regenerateReport,
  } = useRegenerateReport({
    userId,
    onReportRegenerated: () => {
      setHasRegenerated(true);
      refetch();
    },
  });

  const reportMarkdownSource = useMemo(() => {
    if (isRegenerating && isStreamForKey) {
      if (partialText.length > 0) return partialText;
      return reportData?.content ?? "";
    }
    return reportData?.content ?? "";
  }, [
    isRegenerating,
    isStreamForKey,
    partialText,
    reportData?.content,
  ]);

  const reportSectionsDisplay = useMemo(() => {
    const base = parseRexScreenerReportSections(
      reportMarkdownSource,
      isBNBToken,
    );
    if (!goldenPublic?.eligible) {
      return base;
    }
    return mergeGoldenTeamUpdatesSections(
      base,
      goldenPublic.content || "",
      goldenPublic.publishedAt,
    );
  }, [reportMarkdownSource, isBNBToken, goldenPublic]);

  const reportMenuItems = useMemo(
    () =>
      reportSectionsDisplay.map((s) => ({
        title: displayReportSectionTitle(s.title),
        id: s.id,
      })),
    [reportSectionsDisplay],
  );

  useEffect(() => {
    if (isRegenerating && countdown === null) {
      setCountdown(100);
    } else if (!isRegenerating && countdown !== null) {
      setCountdown(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isRegenerating, countdown]);

  // Countdown timer logic
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) return isRegenerating ? 100 : null;
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [countdown, isRegenerating]);

  // Looping 20→1 countdown while fetching tweets only or full report regen
  useEffect(() => {
    const active = isRefreshingTweets || isRegenerating;
    if (!active) {
      setTopTweetsFetchCountdown(TOP_TWEETS_FETCH_COUNTDOWN_SEC);
      if (topTweetsCountdownIntervalRef.current) {
        clearInterval(topTweetsCountdownIntervalRef.current);
        topTweetsCountdownIntervalRef.current = null;
      }
      return;
    }
    setTopTweetsFetchCountdown(TOP_TWEETS_FETCH_COUNTDOWN_SEC);
    if (topTweetsCountdownIntervalRef.current) {
      clearInterval(topTweetsCountdownIntervalRef.current);
    }
    topTweetsCountdownIntervalRef.current = setInterval(() => {
      setTopTweetsFetchCountdown((prev) =>
        prev <= 1 ? TOP_TWEETS_FETCH_COUNTDOWN_SEC : prev - 1,
      );
    }, 1000);
    return () => {
      if (topTweetsCountdownIntervalRef.current) {
        clearInterval(topTweetsCountdownIntervalRef.current);
        topTweetsCountdownIntervalRef.current = null;
      }
    };
  }, [isRefreshingTweets, isRegenerating]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (topTweetsCountdownIntervalRef.current) {
        clearInterval(topTweetsCountdownIntervalRef.current);
        topTweetsCountdownIntervalRef.current = null;
      }
      if (regenTimeoutRef.current) {
        clearTimeout(regenTimeoutRef.current);
        regenTimeoutRef.current = null;
      }
    };
  }, []);

  // Auto-hide "Regenerated!" badge after 2 seconds
  useEffect(() => {
    if (hasRegenerated) {
      // clear any existing timeout first
      if (regenTimeoutRef.current) clearTimeout(regenTimeoutRef.current);
      regenTimeoutRef.current = setTimeout(() => {
        setHasRegenerated(false);
        regenTimeoutRef.current = null;
      }, 2000);
    }
  }, [hasRegenerated]);

  const handleRegenerate = async () => {
    try {
      setHasRegenerated(false);
      setCountdown(100);
      await regenerateReport({
        reportId,
        streamContractAddress: reportData?.contractAddress,
      });
      await refetch();
    } catch (err) {
      console.error("Failed to regenerate report:", err);
      setCountdown(null);
    }
  };

  /** Twitter/X only: server route calls getTweetsSearch in @/lib/api/tweet.ts (no full LLM regen). */
  const handleRefreshTweetsOnly = async () => {
    if (isRefreshingTweets || isRegenerating) return;
    setIsRefreshingTweets(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/refresh-tweets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["reports", userId] });
      await refetch();
    } catch (err) {
      console.error("Failed to refresh tweets:", err);
    } finally {
      setIsRefreshingTweets(false);
    }
  };

  const logo = dexData?.info?.imageUrl;
  const headerImage = dexData?.info?.header;
  const websites = dexData?.info?.websites || [];
  const socials = dexData?.info?.socials || [];

  function renderTweetsSection(): React.ReactNode {
    const tweetsData = reportData?.tweetsData;

    if (
      isFetching &&
      (!tweetsData || (Array.isArray(tweetsData) && tweetsData.length === 0)) &&
      !isRegenerating &&
      !isRefreshingTweets
    ) {
      return (
        <div className="text-center py-6 sm:py-8 text-white/60">
          <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3 sm:mb-4"></div>
          <p className="text-sm sm:text-base">Loading tweet data...</p>
        </div>
      );
    }

    if (isRefreshingTweets || isRegenerating) {
      return (
        <div className="space-y-4 sm:space-y-5">
          <div className="text-center py-2">
            <p className="!text-yellow-400 font-semibold tabular-nums text-lg sm:text-xl">
              {topTweetsFetchCountdown}s
            </p>
          </div>
        </div>
      );
    }

    if (tweetsData && Array.isArray(tweetsData) && tweetsData.length > 0) {
      // Use the structured tweets data with enriched information
      return (
        <div className="space-y-4 sm:space-y-6">
          {tweetsData.map((tweet: any, idx: number) => {
            const tweeter = tweet.tweeter || {};
            const username = tweeter.userName || tweeter.username || "unknown";
            const displayName = tweeter.name || username;
            const profileImage = tweeter.publicImageUrl;
            const text = tweet.text || "";
            const isVerified = tweeter.isBlueVerified;
            const verifiedType = tweeter.verifiedType;
            const followers = tweeter.followers || 0;
            const location = tweeter.location;

            const formatNumber = (num: number) => {
              if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
              if (num >= 1000) return (num / 1000).toFixed(1) + "K";
              return num.toString();
            };

            const formatTimestamp = (timestamp: string) => {
              if (!timestamp) return "";
              const date = new Date(timestamp);
              const now = new Date();
              const diffMs = now.getTime() - date.getTime();
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              const diffDays = Math.floor(diffHours / 24);

              if (diffDays > 0) return `${diffDays}d`;
              if (diffHours > 0) return `${diffHours}h`;
              return "now";
            };

            return (
              <div
                key={tweet.id || idx}
                className="bg-black/20 rounded-lg p-3 sm:p-4 md:p-5 border border-white/10 hover:border-blue-400/50 transition-colors"
              >
                <div className="flex items-start gap-2 sm:gap-3 md:gap-4">
                  {/* Avatar - responsive sizing */}
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-blue-500 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                    {profileImage ? (
                      <Image
                        src={profileImage}
                        alt={`${displayName}`}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-xs sm:text-sm font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* User info header - mobile responsive layout */}
                    <div className="mb-2 sm:mb-3">
                      {/* Main user info line - wraps on mobile */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
                        <div className="flex flex-col min-w-0">
                          {/* Name and verification line */}
                          <div className="flex items-center gap-1 sm:gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-white text-sm sm:text-base truncate">
                              {displayName}
                            </span>
                            {isVerified && (
                              <span
                                className="text-blue-400 shrink-0"
                                title={`Verified ${verifiedType || "account"}`}
                              >
                                {verifiedType === "Blue" ? "🔹" : "✓"}
                              </span>
                            )}
                            <span className="text-white/50 text-xs sm:text-sm truncate">
                              @{username}
                            </span>
                            {tweet.createdAt && (
                              <>
                                <span className="text-white/30 hidden sm:inline">
                                  ·
                                </span>
                                <span className="text-white/50 text-xs sm:text-sm shrink-0">
                                  {formatTimestamp(tweet.createdAt)}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Secondary info line - stacks on mobile */}
                          <div className="flex items-center gap-2 sm:gap-3 mt-0.5 sm:mt-1 text-xs sm:text-sm text-white/50 flex-wrap">
                            {followers > 0 && (
                              <span className="shrink-0">
                                {formatNumber(followers)} followers
                              </span>
                            )}
                            {location && (
                              <>
                                {followers > 0 && (
                                  <span className="hidden sm:inline">·</span>
                                )}
                                <span className="truncate">📍 {location}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* View on X link - better mobile positioning */}
                        {tweet.url && (
                          <a
                            href={tweet.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-xs sm:text-sm transition-colors shrink-0 self-start mt-1 sm:mt-0"
                          >
                            <span className="hidden sm:inline">
                              View on X →
                            </span>
                            <span className="sm:hidden">View →</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Reply context */}
                    {tweet.isReply && tweet.inReplyToUsername && (
                      <div className="text-white/50 text-xs sm:text-sm mb-2">
                        Replying to @{tweet.inReplyToUsername}
                      </div>
                    )}

                    {/* Tweet content - better mobile text sizing */}
                    <p className="text-white/90 leading-relaxed mb-3 whitespace-pre-wrap text-sm sm:text-base">
                      {text}
                    </p>

                    {/* Tweet entities - mobile responsive */}
                    {tweet.entities && (
                      <div className="space-y-2 mb-3">
                        {/* External Links - better mobile overflow handling */}
                        {tweet.entities.urls &&
                          tweet.entities.urls.length > 0 && (
                            <div className="space-y-1">
                              {tweet.entities.urls.map(
                                (urlEntity: any, urlIdx: number) => (
                                  <div
                                    key={urlIdx}
                                    className="text-blue-400 text-xs sm:text-sm"
                                  >
                                    <span className="mr-1">🔗</span>
                                    <a
                                      href={urlEntity.expanded_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline break-all"
                                    >
                                      {urlEntity.display_url}
                                    </a>
                                  </div>
                                )
                              )}
                            </div>
                          )}

                        {/* Hashtags and Mentions - better mobile wrapping */}
                        <div className="flex flex-wrap gap-1 sm:gap-2">
                          {tweet.entities.hashtags &&
                            tweet.entities.hashtags.map(
                              (hashtag: any, hashIdx: number) => (
                                <span
                                  key={hashIdx}
                                  className="text-blue-400 text-xs sm:text-sm break-all"
                                >
                                  #{hashtag.text}
                                </span>
                              )
                            )}
                          {tweet.entities.user_mentions &&
                            tweet.entities.user_mentions.map(
                              (mention: any, mentionIdx: number) => (
                                <span
                                  key={mentionIdx}
                                  className="text-green-400 text-xs sm:text-sm"
                                >
                                  @{mention.screen_name}
                                </span>
                              )
                            )}
                        </div>
                      </div>
                    )}

                    {/* Media - mobile responsive */}
                    {tweet.media?.mediaUrl && (
                      <div className="mt-2 sm:mt-3 mb-2 sm:mb-3">
                        <Image
                          src={tweet.media.mediaPreview || tweet.media.mediaUrl}
                          alt="Tweet media"
                          width={400}
                          height={250}
                          className="rounded-md border border-white/10 w-full h-auto"
                        />
                      </div>
                    )}

                    {/* Engagement metrics - improved mobile grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4 text-xs sm:text-sm text-white/60 pt-2 sm:pt-3 border-t border-white/10">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="shrink-0">💬</span>
                        <span className="truncate">
                          {formatNumber(tweet.replyCount || 0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="shrink-0">🔄</span>
                        <span className="truncate">
                          {formatNumber(tweet.retweetCount || 0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="shrink-0">❤️</span>
                        <span className="truncate">
                          {formatNumber(tweet.likeCount || 0)}
                        </span>
                      </div>
                      {tweet.viewCount && (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="shrink-0">👁️</span>
                          <span className="truncate">
                            {formatNumber(tweet.viewCount)}
                          </span>
                        </div>
                      )}
                      {tweet.quoteCount && tweet.quoteCount > 0 && (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="shrink-0">💭</span>
                          <span className="truncate">
                            {formatNumber(tweet.quoteCount)}
                          </span>
                        </div>
                      )}
                      {tweet.bookmarkCount && tweet.bookmarkCount > 0 && (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="shrink-0">🔖</span>
                          <span className="truncate">
                            {formatNumber(tweet.bookmarkCount)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Additional metadata - mobile responsive */}
                    {(tweet.source || tweet.lang !== "en") && (
                      <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-2 sm:gap-4 text-xs text-white/40">
                        {tweet.source && (
                          <span className="truncate">via {tweet.source}</span>
                        )}
                        {tweet.lang && tweet.lang !== "en" && (
                          <span className="shrink-0">
                            lang: {tweet.lang}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-6 sm:py-8 gap-2">
        <button
          type="button"
          onClick={handleRefreshTweetsOnly}
          disabled={isRegenerating || isRefreshingTweets}
          className={`w-17.5 h-7.5 flex items-center justify-center transition ${
            isRegenerating || isRefreshingTweets
              ? "opacity-60 cursor-wait"
              : "cursor-pointer"
          }`}
          aria-label="Fetch latest tweets from X"
          title="Fetches live tweets via Twitter API (lib/api/tweet.ts on the server)"
        >
          <Image
            src="/images/generate.webp"
            alt="Generate"
            width={100}
            height={40}
            className="object-contain hover:scale-[1.05] transition"
          />
        </button>
      </div>
    );
  }

  function renderSectionContent(title: string, lines: string[]) {
    const t = title.toLowerCase();
    const body = lines.join("\n");

    // Handle Top Tweets (legacy: "Individual Tweets" in stored markdown)
    if (t.includes("individual tweets") || t.includes("top tweets"))
      return renderTweetsSection();

    // Handle Coin-O-Metry section
    if (t.includes("coin-o-metry"))
      return dexData ? <CoinOMetry dexData={dexData} /> : "";

    if (t.includes("safety analytics")) {
      // Hide Safety Analytics section entirely for non-BNB chains
      if (!isBNBToken) return "";
      return (
        <div className="space-y-6">
          {renderRexPilotMarkdownSection(body)}

          {securityAnalytics && isBNBToken && (
            <div className="mt-8">
              <BirdeyeSafetyAnalyticsComponent data={securityAnalytics} />
            </div>
          )}

          {analyticsLoading && isBNBToken && (
            <div className="text-center py-8 text-white/60">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Loading safety analytics...</p>
            </div>
          )}
        </div>
      );
    }

    if (t.includes("holder analytics")) {
      // Hide Holder Analytics section entirely for non-BNB chains
      if (!isBNBToken) return "";
      return (
        <div className="space-y-6">
          {renderRexPilotMarkdownSection(body)}

          {holderAnalytics && isBNBToken && (
            <div className="mt-8">
              <HolderAnalyticsComponent data={holderAnalytics} />
            </div>
          )}

          {analyticsLoading && isBNBToken && (
            <div className="text-center py-8 text-white/60">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Loading holder analytics...</p>
            </div>
          )}
        </div>
      );
    }

    // Default case - just render markdown
    return renderRexPilotMarkdownSection(body);
  }

  function renderReportFromSections(sections: RexReportSection[]): React.ReactNode {
    return (
      <div className="space-y-8">
        {sections.map(({ title, body, id }) => (
          <div key={id} id={id} className="scroll-mt-24">
            <h2 className="rex-pilot-section-heading mb-4 flex items-center gap-3">
              {displayReportSectionTitle(title)}
              {getRexPilotReportSectionIcon(title)}
            </h2>
            <div className="space-y-3">
              {renderSectionContent(title, body)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* -----------------------  Regenerate Button  ------------------------- */
  function RegenerateButton() {
    const title = isRegenerating
      ? `Regenerating... ${countdown}s remaining`
      : hasRegenerated
      ? "Report regenerated!"
      : "Re-generate Report";

    return (
      <button
        onClick={handleRegenerate}
        disabled={isRegenerating}
        className={`mr-2 p-1 rounded transition relative ${
          isRegenerating ? "opacity-70 cursor-wait" : ""
        }`}
        title={title}
        aria-label={title}
      >
        {isRegenerating && countdown !== null ? (
          <div className="flex items-center justify-center w-12.5 h-12.5">
            <div className="text-[#FFD700] font-bold text-lg animate-pulse">
              {countdown}s
            </div>
          </div>
        ) : hasRegenerated ? (
          <div className="flex items-center justify-center rounded-sm bg-[#FFD700] px-2 py-1">
            <span className="text-black font-bold! text-xs">Regenerated!</span>
          </div>
        ) : (
          <RotateCcw className="w-6 h-6 text-white hover:text-[#FFD700] transition-colors" />
        )}
      </button>
    );
  }

  function CopyContractAddressButton({
    contractaddress,
  }: {
    contractaddress: string;
  }) {
    const [copied, setCopied] = useState(false);
    const onCopy = useCallback(() => {
      copy(contractaddress);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_MS);
    }, [contractaddress]);

    return (
      <button
        onClick={onCopy}
        className="p-1 rounded transition relative z-50"
        title={copied ? "Copied!" : "Copy Report"}
        aria-label={copied ? "Copied!" : "Copy Report"}
      >
        {copied ? (
          <Check className="w-12.5 h-12.5 text-white transition-transform" />
        ) : (
          <Image
            src={"/images/copy.png"}
            alt="copy button"
            width={50}
            height={50}
          />
        )}
      </button>
    );
  }

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleSend = useCallback(async () => {
    if (!inputMessage.trim() || sending || !reportData?.id) return;

    const nowIso = new Date().toISOString();
    let acc = "";

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setSending(true);
      setStreamingContent("");
      setShouldAutoScroll(true);
      // Reset auto-scroll flag when sending a new message (user scrolls manually when AI answers)
      shouldAutoScrollRef.current = true;
      hadStreamingRef.current = false;
      // Scroll immediately to show the newly sent message area
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });

      await appendMessage.mutateAsync({
        reportId,
        role: "user",
        content: inputMessage.trim(),
        timestamp: nowIso,
      });

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          message: inputMessage.trim(),
          reportData: reportData.content,
          contractAddress: reportData.contractAddress,
          ticker: reportData.ticker,
          projectName: reportData.projectName,
        }),
        signal: controller.signal,
      });

      setInputMessage("");

      if (!resp.ok) throw new Error("Failed to get response");
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreamingContent(acc);
        }
      }

      await appendMessage.mutateAsync({
        reportId,
        role: "assistant",
        content: acc,
        timestamp: new Date().toISOString(),
      });

      setStreamingContent("");
      // Keep shouldAutoScroll true for the current interaction; it will be
      // reset on conversation switch via the effect on reportId
    } catch (e: any) {
      const isAbort =
        e?.name === "AbortError" ||
        e?.cause?.name === "AbortError" ||
        (typeof DOMException !== "undefined" &&
          e instanceof DOMException &&
          e.name === "AbortError");

      if (isAbort) {
        if (acc.trim()) {
          try {
            await appendMessage.mutateAsync({
              reportId,
              role: "assistant",
              content: `${acc.trim()}\n\n_Generation stopped._`,
              timestamp: new Date().toISOString(),
            });
          } catch (persistErr) {
            console.error("Failed to save partial reply:", persistErr);
          }
        }
        setStreamingContent("");
      } else if (e?.status === 402) {
        const code = (e?.code === "PAID_LIMIT_REACHED"
          ? "PAID_LIMIT_REACHED"
          : "FREE_LIMIT_REACHED") as PaywallLimitCode;
        setPaywallLimitCode(code);
        setShowPaywall(true);
      } else {
        console.error("Chat error:", e);
      }
    } finally {
      abortControllerRef.current = null;
      setSending(false);
      setStreamingContent("");
    }
  }, [inputMessage, sending, appendMessage, reportData, reportId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!sending) handleSend();
      }
    },
    [handleSend, sending]
  );

  if (isLoading || isFetching) {
    return (
      <div className="rex-pilot-panel relative mx-auto flex h-full min-h-0 w-full min-w-0 max-w-360 flex-1 flex-col">
        <PilotSessionTopChrome
          onBack={onBack}
          onViewHistory={onViewHistory}
          onCloseSidebar={onCloseSidebar}
          reportHistoryCount={reportHistoryCount}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-white/60">Loading…</div>
        </div>
      </div>
    );
  }
  if (!reportData) {
    return (
      <div className="rex-pilot-panel relative mx-auto flex h-full min-h-0 w-full min-w-0 max-w-360 flex-1 flex-col">
        <PilotSessionTopChrome
          onBack={onBack}
          onViewHistory={onViewHistory}
          onCloseSidebar={onCloseSidebar}
          reportHistoryCount={reportHistoryCount}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-white/60">No report selected</div>
        </div>
      </div>
    );
  }

  const msgs = reportData?.conversation?.messages || [];

  return (
    <>
    <div
      className="rex-pilot-panel relative flex h-full min-h-0 w-full min-w-0 max-w-360 flex-1 flex-col mx-auto"
      style={{
        maxHeight: "100dvh", // Use dynamic viewport height for mobile
      }}
    >
      <PilotSessionTopChrome
        onBack={onBack}
        onViewHistory={onViewHistory}
        onCloseSidebar={onCloseSidebar}
        reportHistoryCount={reportHistoryCount}
      />
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none p-4"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
          paddingBottom: "0.5rem", // Reduced padding on mobile
        }}
      >
        <div className="rounded-lg relative max-w-full px-0 py-2">
          <div className="flex flex-col w-full justify-center items-center gap-4">
            <div className="flex items-center gap-5">
              {logo && (
                <Image
                  src={logo}
                  alt="Token Logo"
                  width={30}
                  height={30}
                  className="rounded-full border border-white/10"
                />
              )}
              <h2 className="rex-pilot-market-title text-center">
                {reportData.ticker}{" "}
                {reportData.projectName ? `(${reportData.projectName})` : ""}
              </h2>
            </div>

            {/* Last updated timestamp (placed outside row for proper centering) */}
            <p className="text-sm text-white/60 -mt-2 text-center w-full">
              {formatRelativeTime(reportData.updatedAt)}
            </p>

            <div className="flex flex-col gap-5">
              {headerImage && (
                <Image
                  src={headerImage}
                  alt="Header"
                  width={75}
                  height={25}
                  className="rounded-lg border border-white/10 object-cover w-[200] h-[60]"
                />
              )}
              <div className="flex fle-row justify-center w-full gap-8 mt-1">
                {websites?.[0]?.url && (
                  <a
                    href={websites[0].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 hover:text-white transition"
                  >
                    <Image
                      src={"/images/earth.png"}
                      alt="earth png"
                      width={28}
                      height={25}
                    />
                  </a>
                )}
                {socials?.map((s, idx) => {
                  if (!s.url) return null;
                  const isX = s.type === "twitter";
                  const isTg = s.type === "telegram";
                  const icon = isX
                    ? "/images/x.png"
                    : isTg
                    ? "/images/telegram.png"
                    : null;
                  if (!icon) return null;
                  return (
                    <a
                      key={idx}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/60 hover:text-white transition"
                    >
                      <Image
                        src={icon}
                        alt={`${s.type} icon`}
                        width={25}
                        height={25}
                      />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <RegenerateButton />
            <div className="flex items-center">
              <CopyContractAddressButton
                contractaddress={reportData?.contractAddress ?? ""}
              />
            </div>
          </div>

          <div className="rex-markets-report-md rex-markets-report-md--fluid whitespace-pre-wrap wrap-break-word overflow-x-hidden pt-4">
            {renderReportFromSections(reportSectionsDisplay)}
          </div>
        </div>

        <div className="flex flex-col w-full">
          {msgs.map((m: any) => (
            <div
              key={m.id}
              className={`mb-4 ${
                m.role === "user"
                  ? "flex items-start justify-end"
                  : "flex justify-end items-end"
              }`}
            >
              <div className="max-w-full p-4 rounded-lg wrap-break-word">
                <div className="flex items-center gap-2 mb-2">
                  {m.role === "user" ? (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-500">
                      <span className="text-white text-xs">U</span>
                    </div>
                  ) : (
                    <div>
                      <Image
                        src="/images/assistant_banner.png"
                        alt="Assistant avatar"
                        width={120}
                        height={80}
                      />
                    </div>
                  )}
                </div>
                <div className="rex-pilot-body-text wrap-break-word">
                  {formatRexPilotChatLines(m.content)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {streamingContent && (
          <div className="mb-4 flex justify-end">
            <div className="p-4 rounded-lg max-w-full wrap-break-word">
              <div className="flex items-center">
                <Image
                  src="/images/assistant_banner.png"
                  alt="Assistant avatar"
                  width={120}
                  height={80}
                />
              </div>
              <div className="rex-pilot-body-text wrap-break-word">
                {formatRexPilotChatLines(streamingContent)}
                <span className="inline-block w-2 h-4 bg-white/60 animate-pulse ml-1" />
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <ReportMenuDropdown items={reportMenuItems} scrollRootRef={scrollContainerRef} />

      <div
        className="px-4 sm:px-8 w-full max-w-360 mx-auto shrink-0 pb-2 sm:pb-2"
        style={{
          paddingBottom: "0.5rem", // Consistent padding on mobile
          position: "sticky",
          bottom: 0,
          backgroundColor: "#000",
          zIndex: 10,
        }}
      >
        <div className="relative">
          <textarea
            ref={taRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask any follow-up questions!"
            disabled={sending}
            className="w-full max-w-full bg-[#262626] border-[0.5px] border-[#3C3C3C] text-[#BEBEBE] placeholder-[#BEBEBE] rounded-lg pl-4 pr-[4.5rem] py-2.5 resize-none outline-none disabled:opacity-50 min-h-[50px] max-h-[200px] break-words text-[15px] leading-[1.65]"
            rows={2}
            aria-label="Message input"
          />
          {sending ? (
            <button
              type="button"
              onClick={handleStop}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-4 w-4 fill-current text-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputMessage.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md font-semibold text-sm text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              <Image
                src="/images/banner.png"
                width={40}
                height={40}
                alt="Send button"
                className="scale-100 transition-transform duration-300"
              />
            </button>
          )}
        </div>
      </div>
    </div>
    <PaywallModal
      open={showPaywall}
      onClose={() => {
        setShowPaywall(false);
        setPaywallLimitCode(null);
      }}
      context="rexscreener"
      limitCode={paywallLimitCode ?? undefined}
      paymentMetadata={{ userId }}
    />
  </>
  );
}

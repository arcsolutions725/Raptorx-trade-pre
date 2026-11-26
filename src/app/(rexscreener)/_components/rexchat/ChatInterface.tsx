/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import copy from "copy-to-clipboard";
import {
  parseRexScreenerReportSections,
  displayReportSectionTitle,
  type RexReportSection,
} from "@/lib/reportToc";
import {
  mergeGoldenTeamUpdatesSections,
} from "@/lib/goldenReportTeamUpdate";
import {
  useReportWithConversation,
  useAppendMessage,
} from "@/hooks/useReports";
import { useRegenerateReport } from "@/hooks/useRegenerateReport";
import { PaywallModal, type PaywallLimitCode } from "@/components/ui/modal/PaywallModal";
import {
  WhatsNewModal,
} from "@/components/ui/modal/WhatsNewModal";
import { ProjectSocialLinks } from "@/components/ui/ProjectSocialLinks";
import { collectProjectSocials } from "@/lib/api/projectSocials";
import { useWhatsNew } from "@/hooks/useWhatsNew";
import { showErrorNotification } from "@/components/ui/notification";
import { CoinOMetry } from "@/components/CoinOMetry";
import { HolderAnalyticsComponent } from "@/components/analytics/HolderAnalytics";
import { BirdeyeSafetyAnalyticsComponent } from "@/components/analytics/BirdeyeSafetyAnalytics";
import type { HolderAnalytics } from "@/lib/api/bnbAnalytics";
import type { SecurityAnalytics } from "@/lib/api/birdeyeSecurtiy";
import { useMarketReportStream } from "@/lib/storage/marketReportStreamStore";
import { isBscForBnbAnalyticsSections } from "@/utils/detectChain";
import {
  renderScreenerReportMarkdown,
  screenerReportSectionBadge,
} from "./rexPilotReportMarkdown";
import {
  AskBar,
  QaThread,
  SkeletonLines,
} from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/pilotUi";
import {
  IconCheck,
  IconExt,
  IconNews,
  IconRefresh,
  IconShare,
  ReportPaneHead,
  SectionNav,
} from "./screenerSideUi";
import {
  CopyReportButton,
  IN_SHORT_ID,
  ReportInShort,
  ReportRail,
  recentReportItems,
  reportCopyText,
  reportInShort,
  reportReadMinutes,
  useTokenChartAction,
} from "./fullReportUi";
import type {
  RecentReports,
  WhatsNewFacts,
} from "@/components/ui/modal/WhatsNewModal";
import { hrefForScreenerToken } from "@/lib/rexscreenerRoutes";
import { resolveSwapChain } from "@/lib/swapChain";

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
  /** Bring up the panel's swap for this report's token (What's New "Trade" card); `full` = Exchange only. */
  onOpenExchange?: (opts?: { full?: boolean }) => void;
  /** Minimize control in the pane head (the sidebar's Exchange then takes the column). */
  onMinimize?: () => void;
  /** The viewer's saved reports (GET /api/reports rows) for the "Recently generated" card. */
  recentReports?: ReadonlyArray<Record<string, unknown>>;
  /** Open another saved report in this panel ("Recently generated"). */
  onOpenReport?: (reportId: string) => void;
};

/** Pane head while a saved report is open: Back, title, Report history, minimize (and close if given). */
function PilotSessionTopChrome({
  onBack,
  onViewHistory,
  onCloseSidebar,
  onMinimize,
  reportHistoryCount,
}: {
  onBack?: () => void;
  onViewHistory?: () => void;
  onCloseSidebar?: () => void;
  onMinimize?: () => void;
  reportHistoryCount: number;
}) {
  return (
    <ReportPaneHead
      onBack={onBack}
      onHistory={onViewHistory}
      historyCount={reportHistoryCount}
      onMinimize={onMinimize}
      onClose={onCloseSidebar}
    />
  );
}

const MAX_H = 200;

const TOP_TWEETS_FETCH_COUNTDOWN_SEC = 20;

export default function ChatInterface({
  userId,
  reportId,
  onBack,
  onViewHistory,
  reportHistoryCount = 0,
  onCloseSidebar,
  onOpenExchange,
  onMinimize,
  recentReports,
  onOpenReport,
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
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const {
    loading: whatsNewLoading,
    error: whatsNewError,
    result: whatsNewResult,
    fetchWhatsNew,
    clear: clearWhatsNew,
  } = useWhatsNew(userId);

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

  // When switching conversations (e.g., via chat history), do not auto-scroll initially,
  // and start the newly opened report at its top (e.g. opened from "Recently generated")
  useEffect(() => {
    setShouldAutoScroll(false);
    scrollContainerRef.current?.scrollTo({ top: 0 });
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

  const projectLinks = useMemo(
    () => collectProjectSocials({ info: dexData?.info }),
    [dexData],
  );

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

  /** "In short" (design report.html .report-takeaway): the opening of the report's own summary. */
  const inShort = useMemo(
    () => reportInShort(reportSectionsDisplay),
    [reportSectionsDisplay],
  );

  /** "· N min read" next to Updated, from the report text. */
  const readMinutes = useMemo(
    () => reportReadMinutes(reportMarkdownSource),
    [reportMarkdownSource],
  );

  const reportMenuItems = useMemo(
    () => [
      ...(inShort ? [{ title: "In short", id: IN_SHORT_ID }] : []),
      ...reportSectionsDisplay.map((s) => ({
        title: displayReportSectionTitle(s.title),
        id: s.id,
      })),
    ],
    [reportSectionsDisplay, inShort],
  );

  const getReportCopyText = useCallback(
    () =>
      reportCopyText({
        ticker: reportData?.ticker,
        projectName: reportData?.projectName,
        updatedAt: reportData?.updatedAt,
        sections: reportSectionsDisplay,
      }),
    [
      reportData?.ticker,
      reportData?.projectName,
      reportData?.updatedAt,
      reportSectionsDisplay,
    ],
  );

  /** Key facts (report rail + What's New): only numbers the report's DexScreener pair has. */
  const tokenFacts = useMemo<WhatsNewFacts>(
    () => ({
      priceUsd: dexData?.priceUsd != null ? Number(dexData.priceUsd) : null,
      change24h: dexData?.priceChange?.h24 ?? null,
      marketCap: dexData?.marketCap ?? null,
      volume24h: dexData?.volume?.h24 ?? null,
      liquidityUsd: dexData?.liquidity?.usd ?? null,
      createdAt: dexData?.pairCreatedAt ?? null,
      contract: reportData?.contractAddress ?? null,
    }),
    [dexData, reportData?.contractAddress],
  );

  const chartAction = useTokenChartAction(
    dexData?.chainId || reportData?.chain,
    reportData?.contractAddress,
  );

  /** "Recently generated": the viewer's other token reports, opened in this panel. */
  const recent = useMemo<RecentReports | null>(() => {
    if (!onOpenReport || !recentReports?.length) return null;
    const items = recentReportItems(recentReports, reportId);
    return items.length
      ? { items, onOpen: onOpenReport, onViewHistory: onViewHistory ?? null }
      : null;
  }, [recentReports, reportId, onOpenReport, onViewHistory]);

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

  const onWhatsNewClick = async () => {
    const ticker = String(reportData?.ticker || "").trim();
    if (!ticker) return;
    setWhatsNewOpen(true);
    try {
      await fetchWhatsNew({
        contractAddress: String(reportData?.contractAddress || ""),
        ticker,
        projectName: reportData?.projectName || undefined,
        chain: reportData?.chain || undefined,
        imageUrl: dexData?.info?.imageUrl,
      });
    } catch {
      // error is already stored on the hook
    }
  };

  const logo = dexData?.info?.imageUrl;
  const headerImage = dexData?.info?.header;

  function renderTweetsSection(): React.ReactNode {
    const tweetsData = reportData?.tweetsData;

    if (
      isFetching &&
      (!tweetsData || (Array.isArray(tweetsData) && tweetsData.length === 0)) &&
      !isRegenerating &&
      !isRefreshingTweets
    ) {
      return (
        <div className="ss-tw-state" role="status">
          <span className="rx-spin" aria-hidden="true" />
          <p className="m-0">Loading tweet data...</p>
        </div>
      );
    }

    if (isRefreshingTweets || isRegenerating) {
      return (
        <div className="ss-tw-state" role="status">
          <span className="ss-tw-count">{topTweetsFetchCountdown}s</span>
        </div>
      );
    }

    if (tweetsData && Array.isArray(tweetsData) && tweetsData.length > 0) {
      // Use the structured tweets data with enriched information
      return (
        <div className="ss-tweets">
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
              <article key={tweet.id || idx} className="ss-tw">
                <div className="ss-tw__ava">
                  {profileImage ? (
                    <Image
                      src={profileImage}
                      alt={`${displayName}`}
                      width={36}
                      height={36}
                    />
                  ) : (
                    <span aria-hidden="true">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="ss-tw__main">
                  <div className="ss-tw__top">
                    <div className="ss-tw__who">
                      <div className="ss-tw__by">
                        <b>{displayName}</b>
                        {isVerified && (
                          <svg
                            className="ss-tw__verified"
                            viewBox="0 0 24 24"
                            role="img"
                            aria-label={`Verified ${verifiedType || "account"}`}
                          >
                            <path
                              d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z"
                              fill="currentColor"
                            />
                            <path
                              d="M8 12.2l2.6 2.6L16.2 9"
                              fill="none"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                        <span>@{username}</span>
                        {tweet.createdAt && (
                          <span>· {formatTimestamp(tweet.createdAt)}</span>
                        )}
                      </div>
                      {(followers > 0 || location) && (
                        <div className="ss-tw__sub">
                          {followers > 0 && (
                            <span className="is-fol">
                              {formatNumber(followers)} followers
                            </span>
                          )}
                          {location && (
                            <span>
                              <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                />
                                <circle cx="12" cy="9.5" r="2.5" fill="currentColor" />
                              </svg>
                              <span className="truncate">{location}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {tweet.url && (
                      <a
                        href={tweet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ss-tw__open"
                        aria-label={`View the post by @${username} on X`}
                      >
                        View on X
                        <IconExt />
                      </a>
                    )}
                  </div>

                  {/* Reply context */}
                  {tweet.isReply && tweet.inReplyToUsername && (
                    <div className="ss-tw__reply">
                      Replying to @{tweet.inReplyToUsername}
                    </div>
                  )}

                  <p className="ss-tw__text">{text}</p>

                  {tweet.entities && (
                    <>
                      {tweet.entities.urls && tweet.entities.urls.length > 0 && (
                        <div className="ss-tw__urls">
                          {tweet.entities.urls.map(
                            (urlEntity: any, urlIdx: number) => (
                              <a
                                key={urlIdx}
                                href={urlEntity.expanded_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                                  <path
                                    d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                                {urlEntity.display_url}
                              </a>
                            )
                          )}
                        </div>
                      )}

                      {((tweet.entities.hashtags &&
                        tweet.entities.hashtags.length > 0) ||
                        (tweet.entities.user_mentions &&
                          tweet.entities.user_mentions.length > 0)) && (
                        <div className="ss-tw__tags">
                          {tweet.entities.hashtags &&
                            tweet.entities.hashtags.map(
                              (hashtag: any, hashIdx: number) => (
                                <span key={hashIdx} className="is-tag">
                                  #{hashtag.text}
                                </span>
                              )
                            )}
                          {tweet.entities.user_mentions &&
                            tweet.entities.user_mentions.map(
                              (mention: any, mentionIdx: number) => (
                                <span key={mentionIdx} className="is-at">
                                  @{mention.screen_name}
                                </span>
                              )
                            )}
                        </div>
                      )}
                    </>
                  )}

                  {tweet.media?.mediaUrl && (
                    <Image
                      src={tweet.media.mediaPreview || tweet.media.mediaUrl}
                      alt="Tweet media"
                      width={400}
                      height={250}
                      className="ss-tw__media"
                    />
                  )}

                  <div className="ss-tw__meta">
                    <span aria-label={`${tweet.replyCount || 0} replies`}>
                      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M4 5h16v11H9l-5 4z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {formatNumber(tweet.replyCount || 0)}
                    </span>
                    <span aria-label={`${tweet.retweetCount || 0} reposts`}>
                      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M7 7h11v5M17 17H6v-5M15 4l3 3-3 3M9 20l-3-3 3-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {formatNumber(tweet.retweetCount || 0)}
                    </span>
                    <span className="is-like" aria-label={`${tweet.likeCount || 0} likes`}>
                      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z"
                          fill="currentColor"
                        />
                      </svg>
                      {formatNumber(tweet.likeCount || 0)}
                    </span>
                    {tweet.viewCount && (
                      <span aria-label={`${tweet.viewCount} views`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        {formatNumber(tweet.viewCount)}
                      </span>
                    )}
                    {tweet.quoteCount && tweet.quoteCount > 0 && (
                      <span aria-label={`${tweet.quoteCount} quotes`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {formatNumber(tweet.quoteCount)}
                      </span>
                    )}
                    {tweet.bookmarkCount && tweet.bookmarkCount > 0 && (
                      <span aria-label={`${tweet.bookmarkCount} bookmarks`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M6 3h12v18l-6-4-6 4z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {formatNumber(tweet.bookmarkCount)}
                      </span>
                    )}
                  </div>

                  {(tweet.source || tweet.lang !== "en") && (
                    <div className="ss-tw__extra">
                      {tweet.source && (
                        <span className="truncate">via {tweet.source}</span>
                      )}
                      {tweet.lang && tweet.lang !== "en" && (
                        <span>lang: {tweet.lang}</span>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      );
    }

    return (
      <div className="ss-tw-state">
        <button
          type="button"
          onClick={handleRefreshTweetsOnly}
          disabled={isRegenerating || isRefreshingTweets}
          className="rx-btn rx-btn--report rx-btn--s"
          aria-label="Fetch latest tweets from X"
          title="Fetches live tweets via Twitter API (lib/api/tweet.ts on the server)"
        >
          <IconRefresh size={13} />
          Generate
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
        <>
          {renderScreenerReportMarkdown(body)}

          {securityAnalytics && isBNBToken && (
            <div className="mt-2">
              <BirdeyeSafetyAnalyticsComponent data={securityAnalytics} />
            </div>
          )}

          {analyticsLoading && isBNBToken && (
            <div className="ss-loading" role="status">
              <span className="rx-spin" aria-hidden="true" />
              <p className="m-0">Loading safety analytics...</p>
            </div>
          )}
        </>
      );
    }

    if (t.includes("holder analytics")) {
      // Hide Holder Analytics section entirely for non-BNB chains
      if (!isBNBToken) return "";
      return (
        <>
          {renderScreenerReportMarkdown(body)}

          {holderAnalytics && isBNBToken && (
            <div className="mt-2">
              <HolderAnalyticsComponent data={holderAnalytics} />
            </div>
          )}

          {analyticsLoading && isBNBToken && (
            <div className="ss-loading" role="status">
              <span className="rx-spin" aria-hidden="true" />
              <p className="m-0">Loading holder analytics...</p>
            </div>
          )}
        </>
      );
    }

    // Default case - just render markdown
    return renderScreenerReportMarkdown(body);
  }

  function renderReportFromSections(sections: RexReportSection[]): React.ReactNode {
    return (
      <div className="ss-report">
        {inShort ? <ReportInShort text={inShort} /> : null}
        {sections.map(({ title, body, id }) => (
          <section
            key={id}
            id={id}
            className={`ss-sec${
              title.toLowerCase().includes("team updates") ? " ss-sec--gold" : ""
            }`}
          >
            <h2 className="ss-sec__title">
              {displayReportSectionTitle(title)}
              {screenerReportSectionBadge(title)}
            </h2>
            <div className="ss-sec__body">
              {renderSectionContent(title, body)}
            </div>
          </section>
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
        type="button"
        onClick={handleRegenerate}
        disabled={isRegenerating}
        className={`rx-icon-btn${
          isRegenerating && countdown !== null
            ? " ss-rh__count"
            : hasRegenerated
            ? " ss-rh__done"
            : ""
        }`}
        title={title}
        aria-label={title}
      >
        {isRegenerating && countdown !== null ? (
          <span className="animate-pulse motion-reduce:animate-none">{countdown}s</span>
        ) : hasRegenerated ? (
          <span>Regenerated!</span>
        ) : (
          <IconRefresh />
        )}
      </button>
    );
  }

  function ShareReportLinkButton() {
    const [copied, setCopied] = useState(false);
    const onShare = useCallback(() => {
      const path = hrefForScreenerToken(
        reportData?.chain,
        reportData?.contractAddress,
      );
      const url = `${window.location.origin}${path}`;
      copy(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }, [reportData?.chain, reportData?.contractAddress]);

    return (
      <span className="ss-tipwrap">
        <button
          type="button"
          onClick={onShare}
          className={`rx-icon-btn${copied ? " ss-rh__ok" : ""}`}
          title={copied ? "Link copied" : "Share report link"}
          aria-label={copied ? "Link copied" : "Share report link"}
        >
          {copied ? <IconCheck /> : <IconShare />}
        </button>
        {copied ? (
          <span className="ss-tip" role="status">
            Link copied
          </span>
        ) : null}
      </span>
    );
  }

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleSend = useCallback(async () => {
    if (!inputMessage.trim() || sending || !reportData?.id) return;

    // Capture the text now so we can restore it into the box if the send fails —
    // otherwise a failed follow-up just vanishes and the user has to retype it.
    const sentText = inputMessage.trim();
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
        content: sentText,
        timestamp: nowIso,
      });

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          message: sentText,
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
        // Previously this only console.error'd, so a failed follow-up looked like
        // the message silently vanished. Surface the real error and put the text
        // back so it isn't lost. The status makes the cause obvious (e.g. 404
        // "Report not found" = the report isn't persisted server-side).
        console.error("Chat error:", e);
        const detail = e?.status
          ? `${e.message || "Request failed"} (${e.status})`
          : e?.message || "Something went wrong. Please try again.";
        showErrorNotification(detail);
        setInputMessage((cur) => (cur.trim() ? cur : sentText));
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
      <div className="ss-chat">
        <PilotSessionTopChrome
          onBack={onBack}
          onViewHistory={onViewHistory}
          onCloseSidebar={onCloseSidebar}
          onMinimize={onMinimize}
          reportHistoryCount={reportHistoryCount}
        />
        <div className="sb-body" role="status">
          <span className="sr-only">Loading…</span>
          <SkeletonLines widths={[46, 90, 76, 84, 60, 38, 82, 70]} />
        </div>
      </div>
    );
  }
  if (!reportData) {
    return (
      <div className="ss-chat">
        <PilotSessionTopChrome
          onBack={onBack}
          onViewHistory={onViewHistory}
          onCloseSidebar={onCloseSidebar}
          onMinimize={onMinimize}
          reportHistoryCount={reportHistoryCount}
        />
        <div className="sb-body">
          <div className="empty">
            <p>No report selected</p>
          </div>
        </div>
      </div>
    );
  }

  const msgs = reportData?.conversation?.messages || [];

  return (
    <>
    <div className="ss-chat">
      <PilotSessionTopChrome
        onBack={onBack}
        onViewHistory={onViewHistory}
        onCloseSidebar={onCloseSidebar}
        onMinimize={onMinimize}
        reportHistoryCount={reportHistoryCount}
      />
      <div
        ref={scrollContainerRef}
        className="sb-body ss-chat__scroll"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
        }}
      >
        {/* Report head (prototype .rep-head): token, links, updated, actions */}
        <header className="ss-rh">
          {logo && (
            <span className="ss-rh__ava">
              <Image src={logo} alt="" width={40} height={40} />
            </span>
          )}
          <h2>
            {reportData.ticker}
            {reportData.projectName ? ` · ${reportData.projectName}` : ""}
          </h2>

          <ProjectSocialLinks
            links={projectLinks}
            className="ss-rh__links justify-center"
          />

          <span className="ss-rh__upd">
            {formatRelativeTime(reportData.updatedAt)}
            {readMinutes ? ` · ${readMinutes} min read` : ""}
          </span>

          {headerImage && (
            <Image
              src={headerImage}
              alt=""
              width={600}
              height={200}
              className="ss-rh__banner"
            />
          )}

          <div className="ss-rh__tools">
            <RegenerateButton />
            <button
              type="button"
              className="rx-btn rx-btn--news rx-btn--s"
              onClick={onWhatsNewClick}
              disabled={whatsNewLoading}
              aria-label="What's New"
            >
              {whatsNewLoading ? (
                <span className="rx-spin" aria-hidden="true" />
              ) : (
                <IconNews />
              )}
              What&apos;s New
            </button>
            <ShareReportLinkButton />
            {/* the contract address copies from the Key facts card below */}
            <CopyReportButton getText={getReportCopyText} />
          </div>
        </header>

        {renderReportFromSections(reportSectionsDisplay)}

        <ReportRail
          symbol={reportData.ticker}
          facts={tokenFacts}
          chart={chartAction}
          onWhatsNew={reportData.ticker ? onWhatsNewClick : null}
          whatsNewBusy={whatsNewLoading}
          recent={recent}
        />

        {/* Follow-up questions (right) and Rex Pilot answers (left, claw mark) */}
        <QaThread messages={msgs} streaming={streamingContent} />

        <div ref={endRef} />
      </div>

      <SectionNav items={reportMenuItems} scrollRootRef={scrollContainerRef} />

      <AskBar
        value={inputMessage}
        onChange={setInputMessage}
        onSend={handleSend}
        onStop={handleStop}
        onKeyDown={onKeyDown}
        isSending={sending}
        placeholder="Ask a follow-up question"
        label="Ask a follow-up question"
        taRef={taRef}
      />
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
    <WhatsNewModal
      open={whatsNewOpen}
      onClose={() => {
        setWhatsNewOpen(false);
        clearWhatsNew();
      }}
      loading={whatsNewLoading}
      error={whatsNewError}
      result={whatsNewResult}
      fallbackLinks={projectLinks}
      imageUrl={logo}
      symbol={reportData?.ticker}
      facts={tokenFacts}
      actions={{
        chart: chartAction,
        // the report is right behind the popup: close it and start the report from the top
        onFullReport: () => {
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          scrollContainerRef.current?.scrollTo({
            top: 0,
            behavior: reduce ? "auto" : "smooth",
          });
        },
      }}
      recent={recent}
      trade={
        onOpenExchange && reportData?.ticker && reportData?.contractAddress
          ? {
              symbol: String(reportData.ticker),
              name: reportData.projectName,
              logo,
              chain: resolveSwapChain({
                swapTokenAddress: String(reportData.contractAddress),
                token: dexData?.chainId
                  ? {
                      tokenAddress: String(reportData.contractAddress),
                      chainId: dexData.chainId,
                    }
                  : null,
                reportChain: reportData.chain,
                reportContractAddress: String(reportData.contractAddress),
              }),
              onTrade: () => onOpenExchange(),
              onFullExchange: () => onOpenExchange({ full: true }),
            }
          : null
      }
    />
  </>
  );
}

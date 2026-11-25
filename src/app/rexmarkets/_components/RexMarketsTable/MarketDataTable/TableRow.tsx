"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  type MouseEvent,
} from "react";
import type { KalashiMarket } from "@/hooks/useKalashiMarkets";
import type { PolymarketMarket } from "@/hooks/usePolymarketMarkets";
import type { LimitlessMarket } from "@/hooks/useLimitlessMarkets";
import { useGenerateMarketReport } from "@/hooks/useGenerateMarketReport";
import { usePrivy } from "@privy-io/react-auth";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useEventMetadata } from "@/hooks/useEventMetadata";
import { useDataSource } from "@/contexts/DataSourceContext";
import clsx from "clsx";
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import { getMarketReportGenKey } from "@/lib/rexmarkets/marketRoutes";
import {
  REX_TABLE_GRID,
  REX_TABLE_GRID_WITH_SOURCE,
  REX_TABLE_PIN,
} from "./TableHeader";
import {
  CheckIcon,
  MarketThumb,
  ReportIcon,
  VenueBadge,
  formatCents,
} from "./listUi";

type MarketReportData = {
  id: string;
  marketTicker: string;
  marketTitle: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  marketData: KalashiMarket;
};

type TableRowProps = {
  market: (KalashiMarket | PolymarketMarket | LimitlessMarket) & {
    _source?: "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun";
  };
  onMarketClick?: (
    market: KalashiMarket | PolymarketMarket | LimitlessMarket
  ) => void;
  onMarketSelected?: (
    eventTicker: string,
    marketTitle: string,
    totalVolume: number,
    eventId?: string,
    marketSource?: string
  ) => void;
  onReportGenerated?: (report: MarketReportData) => void;
  currentUserId: string;
  index?: number;
  showSourceColumn?: boolean;
  showSourceLogo?: boolean;
};

/** Kalshi prices arrive in dollars (0–1); shown in cents. */
function formatPrice(price?: number): string {
  if (typeof price !== "number") return "—";
  return formatCents(price * 100);
}

function formatVolume(volume?: number): string {
  if (typeof volume !== "number") return "—";
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(2)}K`;
  return `$${volume.toFixed(2)}`;
}

function TableRow({
  market,
  onMarketClick,
  onMarketSelected,
  onReportGenerated,
  currentUserId,
  // index: kept in props for callers; rows are no longer zebra-striped
  showSourceColumn = false,
  showSourceLogo = false,
}: TableRowProps) {
  const { dataSource } = useDataSource();

  // Determine source from market or dataSource
  // In "all" mode, use _source from market; otherwise use dataSource
  const marketSource = (market as any)._source || dataSource;
  const { generateFromMarket } = useGenerateMarketReport({
    onReportGenerated: (r) => {
      onReportGenerated?.(r);
    },
    userId: currentUserId,
  });

  // Use marketSource to determine if this specific market is Polymarket, Kalshi, or Limitless
  // This is critical for "all" mode where we have mixed markets
  const isPolymarket = marketSource === "polymarket";
  const isKalshi = marketSource === "kalshi";
  const isLimitless = marketSource === "limitless";
  const isMyriad = marketSource === "myriad";
  const isPredictFun = marketSource === "predictfun";
  const isLimitlessLike = isLimitless || isMyriad || isPredictFun;

  const reportGenKey = getMarketReportGenKey(market as any);
  const { isGenerating, startedAt } = useReportGenStatus(
    reportGenKey || undefined
  );
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { authenticated, ready, login } = usePrivy();

  // Fetch event metadata for image URL (only for Kalshi)
  const { imageUrl: metadataImageUrl } = useEventMetadata(
    isKalshi && (market as KalashiMarket)?.event_ticker
      ? (market as KalashiMarket).event_ticker
      : null
  );
  const [showPaywall, setShowPaywall] = useState(false);
  const category = (market as KalashiMarket).category;

  // Memoize market type calculations
  const marketsArray = useMemo(() => market?.markets || [], [market?.markets]);
  const isMultiChoice = useMemo(() => marketsArray.length > 2, [marketsArray]);
  const isBinaryMarket = useMemo(
    () => marketsArray.length > 0 && marketsArray.length <= 2,
    [marketsArray]
  );

  // Memoize top 2 choices calculation (expensive sort operation) - only for Kalshi
  const topTwoChoices = useMemo(() => {
    if (!isMultiChoice || !isKalshi) return [];
    return [...marketsArray]
      .sort(
        (a, b) =>
          (b.volume_24h ?? b.volume ?? 0) - (a.volume_24h ?? a.volume ?? 0)
      )
      .slice(0, 2);
  }, [isMultiChoice, marketsArray, isKalshi]);

  // Memoize image URL construction
  const symbolImageUrl = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      return pmMarket?.image || pmMarket?.icon || null;
    }
    if (isKalshi) {
      if (metadataImageUrl) return metadataImageUrl;
      const kalshiMarket = market as KalashiMarket;
      if (kalshiMarket?.series_ticker || kalshiMarket?.event_ticker) {
        return `https://d1lvyva3zy5u58.cloudfront.net/series-images-webp/${
          kalshiMarket.series_ticker || kalshiMarket.event_ticker
        }.webp?size=sm`;
      }
    }
    if (isLimitlessLike) {
      const limitlessMarket = market as LimitlessMarket;
      return limitlessMarket?.image || limitlessMarket?.icon || null;
    }
    return null;
  }, [metadataImageUrl, market, isPolymarket, isKalshi, isLimitlessLike]);

  // Memoize formatted values - use marketSource to determine which structure to use
  const yesPrice = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      if (pmMarket.yesPrice === "—") return "—";
      return typeof pmMarket.yesPrice === "number"
        ? formatCents(pmMarket.yesPrice)
        : pmMarket.yesPrice;
    }
    if (isKalshi) {
      const kalshiMarket = market as KalashiMarket;
      return isBinaryMarket ? formatPrice(kalshiMarket.yes_bid) : "—";
    }
    if (isLimitlessLike) {
      const limitlessMarket = market as LimitlessMarket;
      if (limitlessMarket.yesPrice === "—") return "—";
      return typeof limitlessMarket.yesPrice === "number"
        ? formatCents(limitlessMarket.yesPrice)
        : limitlessMarket.yesPrice;
    }
    return "—";
  }, [isBinaryMarket, market, isPolymarket, isKalshi, isLimitlessLike]);

  const noPrice = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      if (pmMarket.noPrice === "—") return "—";
      return typeof pmMarket.noPrice === "number"
        ? formatCents(pmMarket.noPrice)
        : pmMarket.noPrice;
    }
    if (isKalshi) {
      const kalshiMarket = market as KalashiMarket;
      return isBinaryMarket ? formatPrice(kalshiMarket.no_ask) : "—";
    }
    if (isLimitlessLike) {
      const limitlessMarket = market as LimitlessMarket;
      if (limitlessMarket.noPrice === "—") return "—";
      return typeof limitlessMarket.noPrice === "number"
        ? formatCents(limitlessMarket.noPrice)
        : limitlessMarket.noPrice;
    }
    return "—";
  }, [isBinaryMarket, market, isPolymarket, isKalshi, isLimitlessLike]);

  const choice1Price = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      if (pmMarket.choiceI === "—") return "—";
      return typeof pmMarket.choiceI === "number"
        ? formatCents(pmMarket.choiceI)
        : pmMarket.choiceI;
    }
    if (isKalshi) {
      return isMultiChoice
        ? formatPrice(topTwoChoices[0]?.yes_ask_dollars)
        : "—";
    }
    if (isLimitlessLike) {
      const limitlessMarket = market as LimitlessMarket;
      if (limitlessMarket.choiceI === "—") return "—";
      return typeof limitlessMarket.choiceI === "number"
        ? formatCents(limitlessMarket.choiceI)
        : limitlessMarket.choiceI;
    }
    return "—";
  }, [isMultiChoice, topTwoChoices, market, isPolymarket, isKalshi, isLimitlessLike]);

  const choice2Price = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      if (pmMarket.choiceII === "—") return "—";
      return typeof pmMarket.choiceII === "number"
        ? formatCents(pmMarket.choiceII)
        : pmMarket.choiceII;
    }
    if (isKalshi) {
      return isMultiChoice
        ? formatPrice(topTwoChoices[1]?.yes_ask_dollars)
        : "—";
    }
    if (isLimitlessLike) {
      const limitlessMarket = market as LimitlessMarket;
      if (limitlessMarket.choiceII === "—") return "—";
      return typeof limitlessMarket.choiceII === "number"
        ? formatCents(limitlessMarket.choiceII)
        : limitlessMarket.choiceII;
    }
    return "—";
  }, [isMultiChoice, topTwoChoices, market, isPolymarket, isKalshi, isLimitlessLike]);

  const volume24h = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      return formatVolume(pmMarket.volume24hr);
    }
    if (isKalshi) {
      const kalshiMarket = market as KalashiMarket;
      return formatVolume(kalshiMarket.volume_24h);
    }
    if (isLimitlessLike) {
      const limitlessMarket = market as LimitlessMarket;
      // Always format from numeric value for consistent $X.XXK / $X.XXM display
      return formatVolume(limitlessMarket.volume24hr);
    }
    return "—";
  }, [market, isPolymarket, isKalshi, isLimitlessLike]);

  // Initialize countdown when generation starts
  useEffect(() => {
    if (isGenerating && countdown === null) {
      if (startedAt) {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const remaining = 100 - (elapsed % 100);
        setCountdown(Math.max(1, remaining));
      } else {
        setCountdown(100);
      }
    } else if (!isGenerating && countdown !== null) {
      setCountdown(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setHasGenerated(true);
    }
  }, [isGenerating, startedAt, countdown]);

  // Countdown timer interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (countdown !== null && countdown > 0 && isGenerating && reportGenKey) {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) return 100;
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
  }, [countdown, isGenerating, reportGenKey]);

  const handleClick = useCallback(() => {
    onMarketClick?.(market);
  }, [onMarketClick, market]);

  const onGenerateClick = useCallback(
    async (selectedMarket: KalashiMarket | PolymarketMarket | LimitlessMarket) => {
      if (!selectedMarket) return;
      const key = getMarketReportGenKey(selectedMarket as any);
      const vol =
        (selectedMarket as any).volume ?? (selectedMarket as any).volume24hr ?? 0;
      const eid =
        (selectedMarket as any).id != null
          ? String((selectedMarket as any).id)
          : undefined;
      onMarketSelected?.(
        key,
        selectedMarket.title ?? "",
        vol,
        eid,
        (selectedMarket as any)._source,
      );
      try {
        await generateFromMarket(selectedMarket as KalashiMarket | PolymarketMarket);
        setHasGenerated(true);
      } catch (err: any) {
        if (err?.status === 402) {
          setShowPaywall(true);
        }
        setCountdown(null);
        setHasGenerated(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    },
    [generateFromMarket, onMarketSelected]
  );

  const handleSignIn = useCallback(async () => {
    if (!ready) return;
    await login();
  }, [ready, login]);

  const handleGenerateButtonClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!authenticated) {
        handleSignIn();
      } else {
        onGenerateClick(market);
      }
    },
    [authenticated, handleSignIn, onGenerateClick, market]
  );

  const showMeta = showSourceLogo || !!category;

  const cell =
    "flex items-center justify-end whitespace-nowrap px-2.5 py-3 font-mono text-[14px] font-medium tabular-nums tracking-[-.01em]";

  return (
    <>
    <div
      className={clsx(
        "group/row grid items-center border-b border-[rgba(36,36,36,.7)] text-rx-text transition-colors duration-150 hover:bg-[rgba(255,184,0,.035)]",
        showSourceColumn ? REX_TABLE_GRID_WITH_SOURCE : REX_TABLE_GRID,
      )}
    >
      {/* Market (pinned); the whole cell opens the market, the title is the keyboard target */}
      <div
        className={clsx(
          REX_TABLE_PIN,
          "z-[1] flex min-w-0 cursor-pointer items-center gap-3 self-stretch py-3 pl-3 pr-2.5 transition-colors duration-150 group-hover/row:bg-[#15120C] sm:pl-1",
        )}
        title={market.title}
        onClick={handleClick}
      >
        <MarketThumb src={symbolImageUrl} title={market.title} size={32} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <button
            type="button"
            className="line-clamp-2 min-w-0 whitespace-normal break-words text-left text-[14px] font-semibold leading-[1.3] text-rx-text transition-colors hover:text-rx-gold-hi focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi md:line-clamp-1"
          >
            {market.title}
          </button>
          {showMeta && (
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-none text-rx-text-2">
              {showSourceLogo && <VenueBadge venue={marketSource} />}
              {category && <span className="truncate">{category}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Choice I */}
      <div className={cell}>{choice1Price}</div>

      {/* Choice II */}
      <div className={cell}>{choice2Price}</div>

      {/* AI Report */}
      <div className="flex items-center justify-end px-2.5 py-3">
        {isGenerating && countdown !== null ? (
          <span
            className="rx-btn rx-btn--report rx-btn--s pointer-events-none tabular-nums"
            role="status"
            aria-label={`Generating report, ${countdown} seconds left`}
          >
            <span className="rx-spin size-3 border-[1.5px] text-rx-gold" aria-hidden />
            Generating {countdown}s
          </span>
        ) : hasGenerated ? (
          <span className="rx-badge rx-badge--up h-8 gap-1.5 px-2.5 text-[12px]">
            <CheckIcon />
            Generated
          </span>
        ) : (
          <button
            type="button"
            onClick={handleGenerateButtonClick}
            disabled={isGenerating || !ready}
            className="rx-btn rx-btn--report rx-btn--s"
            aria-label={`Generate report for ${market.title}`}
          >
            <ReportIcon />
            Generate report
          </button>
        )}
      </div>

      {/* YES Price */}
      <div className={clsx(cell, "text-rx-up")}>{yesPrice}</div>

      {/* No Price */}
      <div className={clsx(cell, "text-rx-down")}>{noPrice}</div>

      {/* Vol(24h) */}
      <div className={clsx(cell, !showSourceColumn && "pr-3 sm:pr-1")}>
        {volume24h}
      </div>

      {/* Source - only shown when showSourceColumn is true */}
      {showSourceColumn && (
        <div className="flex items-center justify-end px-2.5 py-3 pr-3 sm:pr-1">
          <VenueBadge venue={marketSource} />
        </div>
      )}
    </div>
    <PaywallModal
      open={showPaywall}
      onClose={() => setShowPaywall(false)}
      context="rexmarkets"
      paymentMetadata={currentUserId ? { userId: currentUserId } : undefined}
    />
    </>
  );
}

export default memo(TableRow);

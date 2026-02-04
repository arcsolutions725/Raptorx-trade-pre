"use client";

import Image from "next/image";
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
import { useGenerateMarketReport } from "@/hooks/useGenerateMarketReport";
import { usePrivy } from "@privy-io/react-auth";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useEventMetadata } from "@/hooks/useEventMetadata";
import { useDataSource } from "@/contexts/DataSourceContext";
import clsx from "clsx";

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
  market: (KalashiMarket | PolymarketMarket) & {
    _source?: "kalshi" | "polymarket";
  };
  onMarketClick?: (market: KalashiMarket | PolymarketMarket) => void;
  onReportGenerated?: (report: MarketReportData) => void;
  currentUserId: string;
  index?: number;
  showSourceColumn?: boolean;
  showSourceLogo?: boolean;
};

function formatPrice(price?: number): string {
  if (typeof price !== "number") return "—";
  return `$${(price * 100).toFixed(2)}¢`;
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
  onReportGenerated,
  currentUserId,
  index = 0,
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

  // Use marketSource to determine if this specific market is Polymarket or Kalshi
  // This is critical for "all" mode where we have mixed markets
  const isPolymarket = marketSource === "polymarket";
  const isKalshi = marketSource === "kalshi";

  const { isGenerating, startedAt } = useReportGenStatus(market?.ticker);
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
  const [imageError, setImageError] = useState(false);

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
    return null;
  }, [metadataImageUrl, market, isPolymarket, isKalshi]);

  // Memoize formatted values - use marketSource to determine which structure to use
  const yesPrice = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      if (pmMarket.yesPrice === "—") return "—";
      return typeof pmMarket.yesPrice === "number"
        ? `$${pmMarket.yesPrice.toFixed(2)}¢`
        : pmMarket.yesPrice;
    }
    if (isKalshi) {
      const kalshiMarket = market as KalashiMarket;
      return isBinaryMarket ? formatPrice(kalshiMarket.yes_bid) : "—";
    }
    return "—";
  }, [isBinaryMarket, market, isPolymarket, isKalshi]);

  const noPrice = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      if (pmMarket.noPrice === "—") return "—";
      return typeof pmMarket.noPrice === "number"
        ? `$${pmMarket.noPrice.toFixed(2)}¢`
        : pmMarket.noPrice;
    }
    if (isKalshi) {
      const kalshiMarket = market as KalashiMarket;
      return isBinaryMarket ? formatPrice(kalshiMarket.no_ask) : "—";
    }
    return "—";
  }, [isBinaryMarket, market, isPolymarket, isKalshi]);

  const choice1Price = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      if (pmMarket.choiceI === "—") return "—";
      return typeof pmMarket.choiceI === "number"
        ? `$${pmMarket.choiceI.toFixed(2)}¢`
        : pmMarket.choiceI;
    }
    if (isKalshi) {
      return isMultiChoice
        ? formatPrice(topTwoChoices[0]?.yes_ask_dollars)
        : "—";
    }
    return "—";
  }, [isMultiChoice, topTwoChoices, market, isPolymarket, isKalshi]);

  const choice2Price = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      if (pmMarket.choiceII === "—") return "—";
      return typeof pmMarket.choiceII === "number"
        ? `$${pmMarket.choiceII.toFixed(2)}¢`
        : pmMarket.choiceII;
    }
    if (isKalshi) {
      return isMultiChoice
        ? formatPrice(topTwoChoices[1]?.yes_ask_dollars)
        : "—";
    }
    return "—";
  }, [isMultiChoice, topTwoChoices, market, isPolymarket, isKalshi]);

  const volume24h = useMemo(() => {
    if (isPolymarket) {
      const pmMarket = market as PolymarketMarket;
      return formatVolume(pmMarket.volume24hr);
    }
    if (isKalshi) {
      const kalshiMarket = market as KalashiMarket;
      return formatVolume(kalshiMarket.volume_24h);
    }
    return "—";
  }, [market, isPolymarket, isKalshi]);

  // Reset image error when market or image URL changes
  useEffect(() => {
    setImageError(false);
  }, [market?.ticker, symbolImageUrl]);

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

    if (countdown !== null && countdown > 0 && isGenerating && market?.ticker) {
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
  }, [countdown, isGenerating, market?.ticker]);

  const handleClick = useCallback(() => {
    onMarketClick?.(market);
  }, [onMarketClick, market]);

  const onGenerateClick = useCallback(
    async (selectedMarket: KalashiMarket | PolymarketMarket) => {
      if (!selectedMarket) return;
      try {
        // Generate report using the selected market (supports both Kalshi and Polymarket)
        await generateFromMarket(selectedMarket);
        setHasGenerated(true);
      } catch {
        setCountdown(null);
        setHasGenerated(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    },
    [generateFromMarket]
  );

  const handleSignIn = useCallback(async () => {
    if (!ready) return;
    await login();
  }, [ready, login]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

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

  const isEvenRow = index % 2 === 1;

  const gridColumns = showSourceColumn
    ? "[grid-template-columns:minmax(300px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(100px,1fr)] sm:[grid-template-columns:minmax(400px,2.5fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(100px,1fr)]"
    : "[grid-template-columns:minmax(300px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)] sm:[grid-template-columns:minmax(400px,2.5fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)]";

  return (
    <div
      className={`grid ${gridColumns} items-center px-0 py-0 text-sm text-white/90 text-[14px] ${
        isEvenRow ? "bg-[#191919]" : "bg-black"
      }`}
    >
      {/* Markets */}
      <div
        className={`sm:sticky sm:left-0 sm:z-10 flex items-center px-3 py-2 whitespace-nowrap truncate ${
          isEvenRow ? "bg-[#191919]" : "bg-black"
        } cursor-pointer text-[#ffc000] hover:text-white transition-all duration-200`}
        title={market.title}
        onClick={handleClick}
      >
        <div className="flex items-center gap-2 min-w-0">
          {symbolImageUrl && !imageError && (
            <div className="flex-shrink-0">
              <Image
                src={symbolImageUrl}
                alt={market.title || "Market"}
                width={32}
                height={32}
                className="rounded"
                unoptimized
                onError={handleImageError}
              />
            </div>
          )}
          <div className="flex flex-col min-w-0 gap-1 flex-1">
            <div className="flex items-center gap-2">
              <span className="!font-bold leading-tight truncate">
                {market.title}
              </span>
              {showSourceLogo && (
                <div className="flex-shrink-0 flex items-center">
                  <span className="text-white/60">(</span>
                  {isPolymarket ? (
                    <Image
                      src="/images/polymarket.png"
                      alt="Polymarket"
                      width={16}
                      height={16}
                      className="w-4 h-4"
                    />
                  ) : (
                    <span className="text-[#17cb91] font-bold text-sm">K</span>
                  )}
                  <span className="text-white/60">)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Choice I */}
      <div
        className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-[51px] items-center ${
          isEvenRow ? "bg-[#191919]" : "bg-black"
        }`}
      >
        <span className="!font-bold">{choice1Price}</span>
      </div>

      {/* Choice II */}
      <div
        className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-[51px] items-center ${
          isEvenRow ? "bg-[#191919]" : "bg-black"
        }`}
      >
        <span className="!font-bold">{choice2Price}</span>
      </div>

      {/* AI Report */}
      <div
        className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-[51px] items-center ${
          isEvenRow ? "bg-[#191919]" : "bg-black"
        }`}
      >
        {isGenerating && countdown !== null ? (
          <div className="flex flex-col items-center">
            <div className="text-[#FFD700] font-bold text-lg animate-pulse">
              {countdown}s
            </div>
          </div>
        ) : hasGenerated ? (
          <div className="flex items-center justify-center w-[78px] h-[32px] rounded-sm bg-[#FFD700]">
            <span className="text-black !font-bold text-sm">Generated!</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateButtonClick}
            disabled={isGenerating || !ready}
            className={clsx(
              "relative w-[70px] h-[30px] flex items-center justify-center transition",
              isGenerating || !ready
                ? "opacity-60 cursor-wait"
                : "cursor-pointer hover:opacity-80"
            )}
            aria-label={`Generate report for ${market.title}`}
            style={{ flexShrink: 0, pointerEvents: "auto" }}
          >
            <Image
              src="/images/generate.png"
              alt="generate report"
              width={100}
              height={40}
              className="object-contain hover:scale-[1.05] transition pointer-events-none"
            />
          </button>
        )}
      </div>

      {/* YES Price */}
      <div
        className={`h-[51px] items-center flex justify-center px-3 py-2 whitespace-nowrap truncate ${
          isEvenRow ? "bg-[#191919]" : "bg-black"
        }`}
      >
        <span className="!font-bold text-green-400">{yesPrice}</span>
      </div>

      {/* No Price */}
      <div
        className={`h-[51px] items-center flex justify-center px-3 py-2 whitespace-nowrap truncate ${
          isEvenRow ? "bg-[#191919]" : "bg-black"
        }`}
      >
        <span className="!font-bold text-red-400">{noPrice}</span>
      </div>

      {/* Vol(24h) */}
      <div
        className={`flex items-center justify-center px-3 py-2 whitespace-nowrap h-[51px] relative ${
          isEvenRow ? "bg-[#191919]" : "bg-black"
        }`}
      >
        <span className="!font-bold">{volume24h}</span>
      </div>

      {/* Source - only shown when showSourceColumn is true */}
      {showSourceColumn && (
        <div
          className={`flex items-center justify-center px-3 py-2 whitespace-nowrap h-[51px] relative ${
            isEvenRow ? "bg-[#191919]" : "bg-black"
          }`}
        >
          <span className="!font-bold text-xs">
            {marketSource === "polymarket" ? (
              <span className="text-[#2C59F7]">Polymarket</span>
            ) : (
              <span className="text-[#17cb91]">Kalshi</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(TableRow);

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { formatUsd } from "@/utils/format";
import type { Report } from "@/hooks/useGenerateRexReport";
import { usePrivy } from "@privy-io/react-auth";
import copy from "copy-to-clipboard";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useReportGenStatus, reportGenStore } from "@/lib/storage/reportGenStore";
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import { Token24hSparkline } from "./Token24hSparkline";

function fromEpochSeconds(sec?: number): Date | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return null;
  // Safety net: detect millisecond timestamps (> ~2001 in ms ≈ 1e12)
  const normalized = sec > 1e12 ? Math.floor(sec / 1000) : sec;
  return new Date(normalized * 1000);
}
function timeSince(date: Date | null): string {
  if (!date) return "—";
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  // Mean Gregorian year (~365.25d) + round so ~2y elapsed matches "2 years ago" UIs (floor was ~1y for ~710d).
  const secPerYear = 365.25 * 24 * 3600;
  const approxYears = s / secPerYear;
  if (approxYears >= 1) {
    const y = Math.max(1, Math.round(approxYears));
    return `${y}y`;
  }
  const mo = Math.floor(s / (30 * 24 * 3600));
  if (mo >= 1) return `${mo}mo`;
  const w = Math.floor(s / (7 * 24 * 3600));
  if (w >= 1) return `${w}w`;
  const d = Math.floor(s / (24 * 3600));
  if (d >= 1) return `${d}d`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(s / 60);
  if (m >= 1) return `${m}m`;
  return `${s}s`;
}
function pickVolume24h(v?: TrendingToken["totalVolume"]): number | undefined {
  return v?.["24h"] ?? v?.["12h"] ?? v?.["4h"] ?? v?.["1h"];
}

function pct24h(
  block?: TrendingToken["pricePercentChange"] | TrendingToken["volumePercentChange"]
): number | undefined {
  const v = block?.["24h"];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Magnitude string for multiplier X where multiplier = percentChange / 100 (e.g. 800% → 8, −120% → 1.2). */
function formatMultiplierMagnitudeFromPercent(pct: number): string {
  const a = Math.abs(pct / 100);
  if (a === 0) return "0";
  const decimals = a >= 10 ? 1 : 2;
  return a.toFixed(decimals).replace(/\.?0+$/, "");
}

const pctUpClass =
  "text-emerald-400 font-semibold whitespace-nowrap shrink-0 text-[11px] sm:text-xs tabular-nums inline-flex items-center gap-px";
const pctDownClass =
  "text-red-400 font-semibold whitespace-nowrap shrink-0 text-[11px] sm:text-xs tabular-nums inline-flex items-center gap-px";

/** Dollar amount centered; green +nX in the left half, red −nX in the right half (24h). */
function ValueWithDayChange({
  valueLabel,
  changePct,
}: {
  valueLabel: string;
  changePct: number | undefined;
}) {
  if (changePct == null || !Number.isFinite(changePct)) {
    return (
      <span className="font-bold! block w-full truncate text-center">{valueLabel}</span>
    );
  }
  const multMag = formatMultiplierMagnitudeFromPercent(changePct);
  if (changePct > 0) {
    return (
      <div className="flex w-full min-w-0 items-center overflow-hidden whitespace-nowrap">
        <div className="flex min-w-0 flex-1 justify-end pr-1">
          <span className={pctUpClass}>+{multMag}X</span>
        </div>
        <span className="font-bold! min-w-0 max-w-[min(100%,11rem)] shrink truncate px-0.5 text-center tabular-nums">
          {valueLabel}
        </span>
        <div className="min-w-0 flex-1 pl-1" aria-hidden />
      </div>
    );
  }
  if (changePct < 0) {
    return (
      <div className="flex w-full min-w-0 items-center overflow-hidden whitespace-nowrap">
        <div className="min-w-0 flex-1 pr-1" aria-hidden />
        <span className="font-bold! min-w-0 max-w-[min(100%,11rem)] shrink truncate px-0.5 text-center tabular-nums">
          {valueLabel}
        </span>
        <div className="flex min-w-0 flex-1 justify-start pl-1">
          <span className={pctDownClass}>-{multMag}X</span>
        </div>
      </div>
    );
  }
  return (
    <span className="font-bold! block w-full truncate text-center">{valueLabel}</span>
  );
}

type Props = {
  token?: TrendingToken;
  rank: number | string;
  generateFromToken: (t: TrendingToken) => Promise<Report | undefined>;
  adminGenerateAndStoreFromToken: (
    t: TrendingToken,
    opts?: { confirmOverwrite?: (msg: string) => Promise<boolean> | boolean }
  ) => Promise<Report | undefined>;
  onOpenChart?: (token: TrendingToken) => void;
  currentUserId: string;
  isAdmin: boolean;
  index?: number;
  /** When true (mixed "All chains" view), show a small chain logo before the copy control */
  showChainBadge?: boolean;
  /** Normalized 0–1 series for 24h sparkline (Birdeye hourly); falls back to synthetic path */
  sparklineY?: number[];
  sparklinesFetching?: boolean;
  /** Golden program token (registry) or Golden Reports filter — golden generate artwork */
  useGoldenGenerateArt?: boolean;
  /** Pump program token (registry) or Pump Reports filter — pump generate artwork (ignored if golden) */
  usePumpGenerateArt?: boolean;
  /** Golden/Pump: age enrichment still in flight and row has no `createdAt` yet */
  ageLoading?: boolean;
};

export function TableRow({
  token,
  rank,
  generateFromToken,
  adminGenerateAndStoreFromToken,
  onOpenChart,
  currentUserId,
  isAdmin,
  index = 0,
  showChainBadge = false,
  sparklineY,
  sparklinesFetching = false,
  useGoldenGenerateArt = false,
  usePumpGenerateArt = false,
  ageLoading = false,
}: Props) {
  const { isGenerating, startedAt } = useReportGenStatus(token?.tokenAddress);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const { authenticated, ready, login } = usePrivy();

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
    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Start interval if countdown is set and we're generating
    if (countdown !== null && countdown > 0 && isGenerating && token?.tokenAddress) {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          // Check store directly to avoid stale closure
          const stillGenerating = reportGenStore.getStartedAt(token.tokenAddress) > 0;
          if (prev <= 1) return stillGenerating ? 100 : null;
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
  }, [countdown, isGenerating, token?.tokenAddress]);

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    []
  );

  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [token?.tokenAddress, token?.logo]);

  const displayName = token?.name ?? token?.symbol ?? "Unknown";
  const displaySymbol = token?.symbol ? `${token.symbol}` : "";
  const price = token?.usdPrice;
  const mcap = token?.marketCap;
  const vol = pickVolume24h(token?.totalVolume);
  const liq = token?.liquidityUsd;
  const age = timeSince(fromEpochSeconds(token?.createdAt));
  const logoImage = token?.logo;
  const showTokenImage = Boolean(logoImage) && !logoLoadFailed;

  const priceChange24h = pct24h(token?.pricePercentChange);
  const volumeChange24h = pct24h(token?.volumePercentChange);

  const generateButtonImageSrc = useGoldenGenerateArt
    ? "/images/golden_generate.webp"
    : usePumpGenerateArt
      ? "/images/pump_generate.webp"
      : "/images/generate.webp";

  const lowerChainId = token?.chainId?.toLowerCase();
  const isBnbChain = lowerChainId === "bsc" || token?.chainId === "56";
  const isBaseChain = lowerChainId === "base" || token?.chainId === "8453";
  const isMonadChain = lowerChainId === "monad" || token?.chainId === "10143";
  const isEthereumChain =
    lowerChainId === "ethereum" || lowerChainId === "eth" || token?.chainId === "1";

  const baseCurrency = isBaseChain
    ? "WETH"
    : isEthereumChain
      ? "ETH"
    : isBnbChain
      ? "WBNB"
      : isMonadChain
        ? "MON"
        : "SOL";

  const explorerUrl = isBaseChain
    ? `https://basescan.org/token/${token?.tokenAddress}`
    : isEthereumChain
      ? `https://etherscan.io/token/${token?.tokenAddress}`
    : isBnbChain
      ? `https://bscscan.com/token/${token?.tokenAddress}`
      : isMonadChain
        ? `https://monadscan.com/address/${token?.tokenAddress}`
        : `https://solscan.io/token/${token?.tokenAddress}`;

  const chainBadge = isBaseChain
    ? { src: "/images/base.png", label: "Base" as const }
    : isEthereumChain
      ? { src: "/images/ETH_light_logo.webp", label: "Ethereum" as const }
    : isBnbChain
      ? { src: "/images/bnbchain.png", label: "BNB Chain" as const }
      : isMonadChain
        ? { src: "/images/monad.png", label: "Monad" as const }
        : { src: "/images/solana.png", label: "Solana" as const };

  const openChart = () => {
    if (token?.tokenAddress && onOpenChart && token) onOpenChart(token);
  };
  const keyOpenChart: React.KeyboardEventHandler<HTMLElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openChart();
    }
  };

  const onGenerateClick = async () => {
    if (!token) return;
    openChart();
    try {
      const result = await generateFromToken(token);
      if (result !== undefined) setHasGenerated(true);
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
  };

  const onAdminGenerateAndStoreClick = async () => {
    if (!token) return;
    openChart();
    try {
      await adminGenerateAndStoreFromToken(token, {
        confirmOverwrite: async (msg) => window.confirm(msg),
      });
      setHasGenerated(true);
    } catch {
      setCountdown(null);
      setHasGenerated(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  const handleSignIn = async () => {
    if (!ready) return;
    await login();
  };

  const handleCopyAddress = () => {
    if (!token?.tokenAddress) return;
    copy(token.tokenAddress);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 500);
  };

  if (!token) return null;

  const isEvenRow = index % 2 === 1;

  return (
    <>
      <div className={`min-w-301.5 sm:min-w-379 grid grid-cols-[minmax(200px,1.5fr)_minmax(40px,1fr)_minmax(160px,1fr)_minmax(96px,0.8fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(100px,1fr)_minmax(70px,1fr)] sm:grid-cols-[minmax(400px,2fr)_minmax(200px,1fr)_minmax(140px,1fr)_minmax(108px,0.75fr)_minmax(200px,1fr)_minmax(200px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] items-center px-0 py-0 text-xs sm:text-sm text-white/90 ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
      {/* Token */}
      <div
        className={`sm:sticky sm:left-0 sm:z-10 flex items-center px-3 py-[10.5px] sm:py-2 gap-1 sm:gap-2 whitespace-nowrap truncate ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}
        title={displayName}
      >
        <div className="pr-0 sm:pr-2 shrink-0 text-[#A0A0A5]">{`#${rank}`}</div>

        <button
          type="button"
          onClick={openChart}
          onKeyDown={keyOpenChart}
          className="pl-3 w-8 h-8 shrink-0 overflow-hidden rounded-full outline-none cursor-pointer group py-0! px-0! flex items-center justify-center border border-white/15 bg-white/5 hover:bg-white/10"
          disabled={!token?.tokenAddress}
          aria-label={`Open chart for ${displayName}`}
          title="Open chart"
        >
          {showTokenImage ? (
            <Image
              src={logoImage as string}
              alt=""
              width={32}
              height={32}
              className="w-8 h-8 object-contain group-hover:scale-[1.05] transition"
              onError={() => setLogoLoadFailed(true)}
            />
          ) : (
            <span
              className="text-white/55 text-[15px] font-semibold leading-none select-none"
              aria-hidden
            >
              ?
            </span>
          )}
        </button>

        <div
          role="button"
          tabIndex={0}
          onClick={openChart}
          onKeyDown={keyOpenChart}
          className="pl-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/30 rounded min-w-0"
          aria-label={`Open chart for ${displayName}`}
          title="Open chart"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
            <span className="font-normal leading-tight truncate">
              {displaySymbol
                ? `${displaySymbol}/${baseCurrency}`
                : baseCurrency}
            </span>
            <span className="text-[#ffc000] font-normal leading-tight truncate">
              {displayName}
            </span>
          </div>
        </div>

        {showChainBadge ? (
          <span
            className="inline-flex shrink-0 ml-2 items-center"
            title={chainBadge.label}
          >
            <Image
              src={chainBadge.src}
              alt={chainBadge.label}
              width={18}
              height={18}
              className="w-[18px] h-[18px] object-contain opacity-95"
            />
          </span>
        ) : null}

        <button
          type="button"
          onClick={handleCopyAddress}
          disabled={!token?.tokenAddress}
          className={`inline-flex items-center justify-center rounded px-1.5 py-1 active:scale-95 focus:outline-none shrink-0 ${showChainBadge ? "ml-1" : "ml-2"}`}
          title={token?.tokenAddress ? "Copy contract address" : "No address"}
        >
          {copied ? (
            <Check className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* AI Report */}
      <div className={`sm:sticky sm:left-100 h-12.75 sm:z-10 flex items-center justify-center px-3 py-2 whitespace-nowrap ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        {isGenerating && countdown !== null ? (
          <div className="flex flex-col items-center">
            <div className="text-[#FFD700] font-bold text-lg animate-pulse">
              {countdown}s
            </div>
          </div>
        ) : hasGenerated ? (
          <div className="flex items-center justify-center w-19.5 h-8 rounded-sm bg-[#FFD700]">
            <span className="text-black font-bold! text-sm">
              {isAdmin ? "Stored!" : "Generated!"}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={!authenticated ? handleSignIn : onGenerateClick}
              disabled={isGenerating || !ready}
              className={`w-17.5 h-7.5 flex items-center justify-center transition ${
                isGenerating || !ready
                  ? "opacity-60 cursor-wait"
                  : "cursor-pointer"
              }`}
              aria-label={`Generate report for ${displayName}`}
              style={{ flexShrink: 0 }}
            >
              <Image
                src={generateButtonImageSrc}
                alt="generate report"
                width={100}
                height={40}
                className="object-contain hover:scale-[1.05] transition"
              />
            </button>

            {/* ✅ External Explorer Link (replaces modal) */}
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 font-medium! text-[14px]! rounded-lg text-[#ffc000] transition-colors cursor-pointer hover:text-[#ffda44]"
              aria-label={`View on ${
                isBaseChain
                  ? "BaseScan"
                  : isEthereumChain
                    ? "Etherscan"
                  : isBnbChain
                    ? "BSCScan"
                    : isMonadChain
                      ? "MonadScan"
                      : "SolScan"
              }`}
              title={`View token on ${
                isBaseChain
                  ? "BaseScan"
                  : isEthereumChain
                    ? "Etherscan"
                  : isBnbChain
                    ? "BSCScan"
                    : isMonadChain
                      ? "MonadScan"
                      : "SolScan"
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Market Cap — 24h price %-based multiplier */}
      <div
        className={`sm:sticky sm:left-135 h-12.75 sm:z-10 flex w-full min-w-0 items-center px-3 py-2 ${isEvenRow ? "bg-[#191919]" : "bg-black"}`}
      >
        <div className="min-w-0 w-full overflow-hidden">
          <ValueWithDayChange
            valueLabel={formatUsd(mcap)}
            changePct={priceChange24h}
          />
        </div>
      </div>

      {/* 24h chart — after Mcap */}
      <div
        className={`flex min-h-[48px] w-full min-w-0 self-stretch items-center justify-end overflow-hidden px-1.5 py-1 sm:min-h-[52px] sm:px-2 ${isEvenRow ? "bg-[#191919]" : "bg-black"}`}
      >
        <Token24hSparkline
          changePct24h={priceChange24h}
          seriesY={sparklineY}
          isFetching={sparklinesFetching}
        />
      </div>

      {/* Volume — 24h volume change % as multiplier */}
      <div
        className={`flex h-12.75 w-full min-w-0 items-center px-3 py-2 ${isEvenRow ? "bg-[#191919]" : "bg-black"}`}
      >
        <div className="min-w-0 w-full overflow-hidden">
          <ValueWithDayChange
            valueLabel={formatUsd(vol)}
            changePct={volumeChange24h}
          />
        </div>
      </div>

      {/* Price — 24h price change % as multiplier */}
      <div
        className={`flex h-12.75 w-full min-w-0 items-center px-3 py-2 ${isEvenRow ? "bg-[#191919]" : "bg-black"}`}
      >
        <div className="min-w-0 w-full overflow-hidden">
          <ValueWithDayChange
            valueLabel={formatUsd(price)}
            changePct={priceChange24h}
          />
        </div>
      </div>

      {/* Liquidity */}
      <div className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-12.75 items-center ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        <span className="font-bold!">{formatUsd(liq)}</span>
      </div>

      {/* Age */}
      <div className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-12.75 items-center ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        {ageLoading ? (
          <span
            className="inline-block h-3.5 w-9 animate-pulse rounded bg-white/15"
            aria-label="Loading age"
            role="status"
          />
        ) : (
          <span className="font-bold!">{age}</span>
        )}
      </div>
      </div>
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        context="rexscreener"
        paymentMetadata={currentUserId ? { userId: currentUserId } : undefined}
      />
    </>
  );
}

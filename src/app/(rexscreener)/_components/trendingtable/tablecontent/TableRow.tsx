/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { formatUsd } from "@/utils/format";
import type { Report } from "@/hooks/useGenerateRexReport";
import { usePrivy } from "@privy-io/react-auth";
import copy from "copy-to-clipboard";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useReportGenStatus, reportGenStore } from "@/lib/storage/reportGenStore";
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import {
  WhatsNewModal,
  type WhatsNewResult,
} from "@/components/ui/modal/WhatsNewModal";
import { Token24hChangeBadge, Token24hSparkline } from "./Token24hSparkline";
import { dexScreenerTokenImageUrl } from "@/lib/api/dexscreener";
import {
  SCREENER_GRID_COLS,
  SCREENER_PIN_RANK,
  SCREENER_PIN_TOKEN,
  SCREENER_ROW_MIN_W,
} from "./gridColumns";

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

/** Monogram fallback colour: a stable muted hue per token (no brand colour in the API). */
function monogramBackground(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 38% 34%)`;
}

/* AI report buttons: same shape, two inks (gold Full Report, ember What's New), as in the design. */
const FULL_REPORT_BTN =
  "rx-btn rx-btn--report rx-btn--s px-2.5 font-bold text-[#1A1206] border-[#FFE08A] bg-[linear-gradient(180deg,#FFD15C,#E3A300)] shadow-[0_0_0_1px_rgba(255,184,0,0.15),0_4px_14px_rgba(255,170,0,0.22)] hover:brightness-[1.08] hover:-translate-y-px disabled:translate-none disabled:filter-none sm:px-3";
const WHATS_NEW_BTN =
  "rx-btn rx-btn--news rx-btn--s px-2.5 font-bold text-[#FFD2B8] border-[#B0461C] bg-[linear-gradient(180deg,#3A1A0C,#200E07)] shadow-[0_0_0_1px_rgba(255,106,19,0.1),0_4px_14px_rgba(255,106,19,0.16)] hover:border-rx-ember hover:-translate-y-px disabled:translate-none sm:px-3";
/** Small icon controls next to the ticker (copy address, open explorer). */
const ICON_BTN =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-rx-text-3 transition-colors hover:bg-white/[0.06] hover:text-rx-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rx-gold-hi disabled:pointer-events-none disabled:opacity-40";
const CELL = "px-2.5 py-3";

function ReportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 2.5h8.2L19 7.3V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4A1.5 1.5 0 0 1 6.5 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M14 2.7V7.5h4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 12h7M8.5 15.5h7M8.5 8.5h3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M13.6 1.8 4.3 13.4c-.3.4 0 .9.5.9h5.6l-1.3 7.6c-.1.6.6.9 1 .5l9.4-11.7c.3-.4 0-.9-.5-.9h-5.6l1.2-7.5c.1-.6-.6-.9-1-.5Z"
        fill="#FFD15C"
        stroke="#B87400"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
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
  /** Mixed lists (All chains, Golden, Pump). Every row now shows its chain on the avatar badge. */
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
  /** Dex mcap/price overlay still in flight — don't flash Birdeye numbers */
  marketLoading?: boolean;
};

export function TableRow({
  token,
  rank,
  generateFromToken,
  adminGenerateAndStoreFromToken,
  onOpenChart,
  currentUserId,
  isAdmin: _isAdmin,
  showChainBadge: _showChainBadge = false,
  sparklineY,
  sparklinesFetching = false,
  useGoldenGenerateArt: _useGoldenGenerateArt = false,
  usePumpGenerateArt: _usePumpGenerateArt = false,
  ageLoading = false,
  marketLoading = false,
}: Props) {
  const { isGenerating, startedAt } = useReportGenStatus(token?.tokenAddress);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewLoading, setWhatsNewLoading] = useState(false);
  const [whatsNewError, setWhatsNewError] = useState<string | null>(null);
  const [whatsNewResult, setWhatsNewResult] = useState<WhatsNewResult | null>(
    null,
  );
  const whatsNewInFlightRef = useRef(false);

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
  const constructedLogo = dexScreenerTokenImageUrl(
    token?.chainId,
    token?.tokenAddress,
  );
  const [logoSrc, setLogoSrc] = useState<string | undefined>(
    token?.logo || constructedLogo,
  );
  useEffect(() => {
    setLogoLoadFailed(false);
    setLogoSrc(token?.logo || constructedLogo);
  }, [token?.tokenAddress, token?.logo, constructedLogo]);

  const displayName = token?.name ?? token?.symbol ?? "Unknown";
  const displaySymbol = token?.symbol ? `${token.symbol}` : "";
  const price = token?.usdPrice;
  const mcap = token?.marketCap;
  const vol = pickVolume24h(token?.totalVolume);
  const liq = token?.liquidityUsd;
  const age = timeSince(fromEpochSeconds(token?.createdAt));
  const showTokenImage = Boolean(logoSrc) && !logoLoadFailed;

  const priceChange24h = pct24h(token?.pricePercentChange);
  const volumeChange24h = pct24h(token?.volumePercentChange);

  const lowerChainId = token?.chainId?.toLowerCase();
  const isBnbChain = lowerChainId === "bsc" || token?.chainId === "56";
  const isBaseChain = lowerChainId === "base" || token?.chainId === "8453";
  const isMonadChain = lowerChainId === "monad" || token?.chainId === "10143";
  const isRobinhoodChain = lowerChainId === "robinhood";
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
        : isRobinhoodChain
          ? ((token as { quoteSymbol?: string })?.quoteSymbol || "ETH")
          : "SOL";

  const explorerUrl = isBaseChain
    ? `https://basescan.org/token/${token?.tokenAddress}`
    : isEthereumChain
      ? `https://etherscan.io/token/${token?.tokenAddress}`
    : isBnbChain
      ? `https://bscscan.com/token/${token?.tokenAddress}`
      : isMonadChain
        ? `https://monadscan.com/address/${token?.tokenAddress}`
        : isRobinhoodChain
          ? `https://robinhoodchain.blockscout.com/token/${token?.tokenAddress}`
          : `https://solscan.io/token/${token?.tokenAddress}`;

  const explorerName = isBaseChain
    ? "BaseScan"
    : isEthereumChain
      ? "Etherscan"
    : isBnbChain
      ? "BSCScan"
      : isMonadChain
        ? "MonadScan"
        : isRobinhoodChain
          ? "Robinhood"
          : "SolScan";

  const chainBadge = isBaseChain
    ? { src: "/images/base.png", label: "Base" as const }
    : isEthereumChain
      ? { src: "/images/ETH_light_logo.webp", label: "Ethereum" as const }
    : isBnbChain
      ? { src: "/images/bnbchain.png", label: "BNB Chain" as const }
      : isMonadChain
        ? { src: "/images/monad.png", label: "Monad" as const }
        : isRobinhoodChain
          ? { src: "/images/robinhood.png", label: "Robinhood" as const }
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
      await generateFromToken(token);
    } catch (err: any) {
      if (err?.status === 402) {
        setShowPaywall(true);
      }
      setCountdown(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  const onWhatsNewClick = async () => {
    if (!token?.symbol) return;
    if (whatsNewInFlightRef.current) return;
    if (!currentUserId) {
      setWhatsNewOpen(true);
      setWhatsNewError("Sign in to view What's New.");
      return;
    }

    whatsNewInFlightRef.current = true;
    setWhatsNewOpen(true);
    setWhatsNewLoading(true);
    setWhatsNewError(null);
    setWhatsNewResult(null);

    try {
      const res = await fetch("/api/whats-new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUserId,
        },
          body: JSON.stringify({
          contractAddress: token.tokenAddress,
          ticker: token.symbol,
          projectName: token.name,
          chain: token.chainId,
          imageUrl: token.logo,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setWhatsNewResult({
        summary: String(json.summary || ""),
        paragraphs: Array.isArray(json.paragraphs) ? json.paragraphs : undefined,
        tweets: Array.isArray(json.tweets) ? json.tweets : [],
        metadata: json.metadata,
      });
    } catch (err: unknown) {
      setWhatsNewError(
        err instanceof Error ? err.message : "Failed to load What's New.",
      );
    } finally {
      setWhatsNewLoading(false);
      whatsNewInFlightRef.current = false;
    }
  };

  const onAdminGenerateAndStoreClick = async () => {
    if (!token) return;
    openChart();
    try {
      await adminGenerateAndStoreFromToken(token, {
        confirmOverwrite: async (msg) => window.confirm(msg),
      });
    } catch {
      setCountdown(null);
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

  const monogram =
    (displaySymbol || displayName).replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  const volumeTone =
    volumeChange24h == null || volumeChange24h === 0
      ? null
      : volumeChange24h > 0
        ? "up"
        : "down";

  return (
    <>
      <div
        className={clsx(
          "group grid items-center border-b border-[rgba(36,36,36,0.7)] text-[13px] text-rx-text transition-colors duration-150 hover:bg-[rgba(255,184,0,0.035)] sm:text-sm",
          SCREENER_GRID_COLS,
          SCREENER_ROW_MIN_W,
        )}
      >
        {/* Rank */}
        <div
          className={clsx(
            SCREENER_PIN_RANK,
            "rx-num flex items-center py-3 pl-3 pr-1 text-xs text-rx-text-3 sm:pl-1",
          )}
        >
          {rank}
        </div>

        {/* Token: avatar with chain badge, ticker / quote, copy + explorer, name */}
        <div
          className={clsx(
            SCREENER_PIN_TOKEN,
            "flex min-w-0 items-center gap-3",
            CELL,
          )}
          title={displayName}
        >
          <span className="relative shrink-0">
            <button
              type="button"
              onClick={openChart}
              onKeyDown={keyOpenChart}
              className="rx-avatar rx-avatar--token size-9 cursor-pointer overflow-hidden transition-transform hover:scale-[1.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi disabled:cursor-default"
              style={{
                background: showTokenImage
                  ? "var(--rx-surface-3)"
                  : monogramBackground(token.tokenAddress || displaySymbol || displayName),
              }}
              disabled={!token?.tokenAddress}
              aria-label={`Open chart for ${displayName}`}
              title="Open chart"
            >
              {showTokenImage ? (
                <Image
                  src={logoSrc as string}
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 object-cover"
                  onError={() => {
                    if (logoSrc && constructedLogo && logoSrc !== constructedLogo) {
                      setLogoSrc(constructedLogo);
                      return;
                    }
                    setLogoLoadFailed(true);
                  }}
                />
              ) : (
                <small
                  className="font-mono text-[11px] font-semibold leading-none text-white select-none"
                  aria-hidden
                >
                  {monogram}
                </small>
              )}
            </button>
            <span
              className="rx-avatar__chain overflow-hidden bg-rx-surface-3"
              title={chainBadge.label}
            >
              <Image
                src={chainBadge.src}
                alt={chainBadge.label}
                width={14}
                height={14}
                className="block size-full object-cover"
              />
            </span>
          </span>

          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={openChart}
                disabled={!token?.tokenAddress}
                className="min-w-0 cursor-pointer truncate rounded text-left text-sm font-semibold text-rx-text transition-colors hover:text-rx-gold-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi disabled:cursor-default"
                aria-label={`Open chart for ${displayName}`}
                title="Open chart"
              >
                {displaySymbol || baseCurrency}{" "}
                {displaySymbol ? (
                  <span className="font-normal text-rx-text-3">
                    / {baseCurrency}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={handleCopyAddress}
                disabled={!token?.tokenAddress}
                className={clsx(ICON_BTN, "ml-0.5")}
                title={token?.tokenAddress ? "Copy contract address" : "No address"}
                aria-label={
                  copied
                    ? "Contract address copied"
                    : `Copy ${displaySymbol || displayName} contract address`
                }
              >
                {copied ? (
                  <Check className="size-3.5 text-rx-up" aria-hidden />
                ) : (
                  <Copy className="size-[13px]" aria-hidden />
                )}
              </button>
              {token?.tokenAddress ? (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ICON_BTN}
                  aria-label={`View on ${explorerName}`}
                  title={`View token on ${explorerName}`}
                >
                  <ExternalLink className="size-[13px]" aria-hidden />
                </a>
              ) : null}
            </div>
            <div className="max-w-[230px] truncate text-xs text-rx-text-2 min-[1800px]:max-w-[360px]">
              {displayName}
            </div>
          </div>
        </div>

        {/* AI reports */}
        <div className="flex items-center gap-1.5 px-2 py-3">
          {isGenerating && countdown !== null ? (
            <span
              role="status"
              aria-live="polite"
              aria-label={`Generating report, ${countdown} seconds left`}
              className={clsx(
                FULL_REPORT_BTN,
                "pointer-events-none min-w-[100px] tabular-nums",
              )}
            >
              <span className="rx-spin size-3 border-[1.5px]" aria-hidden />
              {countdown}s
            </span>
          ) : (
            <button
              type="button"
              className={FULL_REPORT_BTN}
              onClick={!authenticated ? handleSignIn : onGenerateClick}
              disabled={isGenerating || !ready || whatsNewLoading}
              aria-label={`Full Report for ${displayName}`}
              title="Full Report"
            >
              <ReportIcon />
              Full Report
            </button>
          )}
          <button
            type="button"
            className={WHATS_NEW_BTN}
            onClick={!authenticated ? handleSignIn : onWhatsNewClick}
            disabled={!ready || whatsNewLoading}
            aria-label={`What's New for ${displayName}`}
            title="What's New"
          >
            {whatsNewLoading ? (
              <span className="rx-spin size-3 border-[1.5px]" aria-hidden />
            ) : (
              <NewsIcon />
            )}
            What&apos;s New
          </button>
        </div>

        {/* Mcap */}
        <div className={clsx(CELL, "rx-num text-right font-semibold text-rx-text")}>
          {marketLoading ? (
            <span
              className="rx-skel ml-auto block h-3.5 w-16"
              role="status"
              aria-label="Loading market cap"
            />
          ) : (
            formatUsd(mcap)
          )}
        </div>

        {/* 24h change */}
        <div className={clsx(CELL, "rx-num flex min-w-0 justify-end")}>
          <Token24hChangeBadge changePct24h={priceChange24h} />
        </div>

        {/* 24h trend */}
        <div className={clsx(CELL, "flex justify-end")}>
          <Token24hSparkline
            changePct24h={priceChange24h}
            seriesY={sparklineY}
            isFetching={sparklinesFetching}
          />
        </div>

        {/* Price */}
        <div className={clsx(CELL, "rx-num text-right font-semibold text-rx-text")}>
          {marketLoading ? (
            <span
              className="rx-skel ml-auto block h-3.5 w-14"
              role="status"
              aria-label="Loading price"
            />
          ) : (
            <div className="truncate" title={formatUsd(price)}>
              {formatUsd(price)}
            </div>
          )}
        </div>

        {/* Volume, with the 24h volume change as a multiplier */}
        <div className={clsx(CELL, "rx-num flex flex-col items-end gap-1 text-right")}>
          <div>{formatUsd(vol)}</div>
          {volumeTone && volumeChange24h != null ? (
            <div
              className={clsx(
                "text-[11px] leading-none",
                volumeTone === "up" ? "text-rx-up" : "text-rx-down",
              )}
              title={`24h volume change ${volumeChange24h > 0 ? "+" : ""}${volumeChange24h.toFixed(2)}%`}
            >
              {volumeTone === "up" ? "+" : "-"}
              {formatMultiplierMagnitudeFromPercent(volumeChange24h)}X
            </div>
          ) : null}
        </div>

        {/* Liquidity */}
        <div className={clsx(CELL, "rx-num text-right text-rx-text-2")}>
          {formatUsd(liq)}
        </div>

        {/* Age */}
        <div className={clsx(CELL, "pr-3 text-right text-rx-text-2 sm:pr-1")}>
          {ageLoading ? (
            <span
              className="rx-skel ml-auto block h-3.5 w-9"
              aria-label="Loading age"
              role="status"
            />
          ) : (
            age
          )}
        </div>
      </div>
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        context="rexscreener"
        paymentMetadata={currentUserId ? { userId: currentUserId } : undefined}
      />
      <WhatsNewModal
        open={whatsNewOpen}
        onClose={() => {
          setWhatsNewOpen(false);
          setWhatsNewError(null);
        }}
        loading={whatsNewLoading}
        error={whatsNewError}
        result={whatsNewResult}
        imageUrl={token?.logo}
      />
    </>
  );
}

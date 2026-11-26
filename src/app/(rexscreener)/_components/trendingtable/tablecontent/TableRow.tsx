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
import { resolveSwapChain } from "@/lib/swapChain";
import { requestShellAction } from "@/components/ui/layout/shellActions";
import {
  SCREENER_GRID_COLS,
  SCREENER_ORDER,
  SCREENER_PIN_RANK,
  SCREENER_PIN_TOKEN,
  SCREENER_ROW_MIN_W,
} from "./gridColumns";
import {
  formatMultiplierMagnitudeFromPercent,
  fromEpochSeconds,
  monogramBackground,
  pct24h,
  pickVolume24h,
  timeSince,
} from "./tokenMeta";

/* AI report buttons (client feedback 24 Nov): antique-gold Full Report with a black report icon,
   graphite What's New with a soft gold edge and a 3D bolt. Colours live in raptorx-ds.css. */
const FULL_REPORT_BTN =
  "rx-btn rx-btn--report rx-btn--gold rx-btn--s px-2.5 font-bold hover:-translate-y-px disabled:translate-none disabled:filter-none sm:px-3";
const WHATS_NEW_BTN =
  "rx-btn rx-btn--news rx-btn--s px-2.5 font-bold hover:-translate-y-px disabled:translate-none sm:px-3";
/** Small icon controls next to the ticker (copy address, open explorer). */
const ICON_BTN =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-rx-text-3 transition-colors hover:bg-white/[0.06] hover:text-rx-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rx-gold-hi disabled:pointer-events-none disabled:opacity-40";
const CELL = "px-2.5 py-3";

/** Full Report on gold: the black report mark (matches the black label). */
function ReportIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="rx-emo rx-emo--ink"
      src="/images/emoji/report-ink.svg"
      alt=""
      width={17}
      height={17}
    />
  );
}

/** What's New: the 3D lightning bolt. */
function NewsIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="rx-emo"
      src="/images/emoji/bolt.webp"
      alt=""
      width={16}
      height={16}
    />
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
  /** `card`: Golden / Pump Reports card (design/reports.html) instead of a table row. Same data and handlers. */
  layout?: "row" | "card";
  /** Which report program the card belongs to (badge + layout). */
  cardKind?: "golden" | "pump";
  /**
   * Pump Reports (design/reports.html): Full Report + Trade, with What's New kept as a compact bolt
   * button after them. Trade opens this token's view with the Exchange on top of the side column.
   */
  showTrade?: boolean;
};

/** Trade: the design's swap glyph (i-swap). */
function SwapIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 7h12l-3-3M17 17H5l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TRADE_BTN =
  "rx-btn rx-btn--secondary rx-btn--s px-2.5 font-bold hover:-translate-y-px disabled:translate-none sm:px-3";

/** Small inline icons for the report cards (design sprite: i-star, i-trend, i-clock). */
function CardIco({ d, size = 12 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const ICO_STAR =
  "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z";
const ICO_TREND = "M3 17l6-6 4 4 8-8M15 7h6v6";
const ICO_CLOCK = "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4l3 2";
const ICO_DROP = "M12 3.5c3 3.6 6 7 6 10.2a6 6 0 0 1-12 0c0-3.2 3-6.6 6-10.2z";

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
  layout = "row",
  cardKind = "golden",
  showTrade = false,
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
    ? { src: "/images/brands/base.webp", label: "Base" as const }
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

  const modals = (
    <>
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
        symbol={token?.symbol}
        facts={{
          priceUsd: price ?? null,
          change24h: priceChange24h ?? null,
          marketCap: mcap ?? null,
          volume24h: vol ?? null,
          liquidityUsd: liq ?? null,
          createdAt: fromEpochSeconds(token?.createdAt)?.getTime() ?? null,
          contract: token?.tokenAddress ?? null,
        }}
        trade={
          token?.tokenAddress && token.symbol
            ? {
                symbol: token.symbol,
                name: token.name,
                logo: logoSrc ?? token.logo,
                chain: resolveSwapChain({
                  swapTokenAddress: token.tokenAddress,
                  token,
                }),
                // Same page: chart this token, then open the panel's Exchange on it.
                onTrade: () => {
                  openChart();
                  requestShellAction("exchange");
                },
              }
            : null
        }
      />
    </>
  );

  /** Trade: chart this token, then open the panel's Exchange on it (same as What's New's Trade). */
  const onTradeClick = () => {
    if (!token?.tokenAddress) return;
    openChart();
    requestShellAction("exchange");
  };

  /** Full Report (or the generation countdown) + What's New: same controls in rows and cards.
   *  Pump Reports: Full Report + Trade, What's New as a compact bolt button. */
  const reportButtons = (
    <>
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
      {showTrade ? (
        <button
          type="button"
          className={TRADE_BTN}
          onClick={onTradeClick}
          disabled={!token?.tokenAddress}
          aria-label={`Trade ${displaySymbol || displayName} on the Exchange`}
          title="Trade on the Exchange"
        >
          <SwapIcon />
          Trade
        </button>
      ) : null}
      <button
        type="button"
        className={clsx(
          WHATS_NEW_BTN,
          showTrade && "rx-rp-btn-icon",
        )}
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
        {showTrade ? null : <>What&apos;s New</>}
      </button>
    </>
  );

  /* ---------- Golden / Pump Reports card (design/reports.html .rp-card) ---------- */
  if (layout === "card") {
    const pump = cardKind === "pump";
    const chgTone =
      priceChange24h == null || priceChange24h === 0
        ? null
        : priceChange24h > 0
          ? "up"
          : "down";
    return (
      <li className="rx-rp-item">
        <article
          className={clsx("rx-raised rx-rp-card", pump && "rx-rp-card--pump")}
          aria-label={`${displaySymbol || displayName}, ${pump ? "Pump" : "Golden"} Report`}
        >
          <div className="rx-rp-card__top">
            <span className="relative shrink-0">
              <button
                type="button"
                onClick={openChart}
                onKeyDown={keyOpenChart}
                className="rx-avatar rx-avatar--token size-11 cursor-pointer overflow-hidden transition-transform hover:scale-[1.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi disabled:cursor-default"
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
                    width={44}
                    height={44}
                    className="size-11 object-cover"
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
                    className="font-mono text-[13px] font-semibold leading-none text-white select-none"
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
            <div className="rx-rp-card__id">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  onClick={openChart}
                  disabled={!token?.tokenAddress}
                  className="rx-rp-card__sym"
                  aria-label={`Open chart for ${displayName}`}
                  title="Open chart"
                >
                  {displaySymbol || displayName}
                </button>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  disabled={!token?.tokenAddress}
                  className={ICON_BTN}
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
              <span className="rx-rp-card__name" title={displayName}>
                {displayName}
              </span>
            </div>
            {pump ? (
              <span className="rx-badge rx-rp-badge--pump">
                <CardIco d={ICO_TREND} size={11} />
                Pump
              </span>
            ) : (
              <span className="rx-badge rx-badge--gold">
                <CardIco d={ICO_STAR} size={11} />
                Golden
              </span>
            )}
          </div>

          <dl className="rx-rp-big">
            <div>
              <dt>Market cap</dt>
              <dd className="rx-num">
                {marketLoading ? (
                  <span className="rx-skel block h-5 w-24" role="status" aria-label="Loading market cap" />
                ) : (
                  formatUsd(mcap)
                )}
              </dd>
            </div>
            <div>
              <dt>Volume 24h</dt>
              <dd className="rx-num">{formatUsd(vol)}</dd>
            </div>
          </dl>

          {pump ? (
            <>
              <div className="rx-rp-move">
                <span
                  className={clsx(
                    "rx-rp-move__val",
                    chgTone === "down" && "is-down",
                    !chgTone && "is-flat",
                  )}
                >
                  {priceChange24h == null
                    ? "—"
                    : `${chgTone === "up" ? "▲ " : chgTone === "down" ? "▼ " : ""}${Math.abs(priceChange24h).toFixed(2)}%`}
                </span>
                <span className="rx-rp-move__in">in 24h</span>
              </div>
              <dl className="rx-rp-stats">
                <div>
                  <dt title="24h volume change">Vol chg</dt>
                  <dd
                    className={clsx(
                      "rx-num",
                      volumeTone === "up" && "text-rx-up",
                      volumeTone === "down" && "text-rx-down",
                    )}
                    title={
                      volumeChange24h != null
                        ? `24h volume change ${volumeChange24h > 0 ? "+" : ""}${volumeChange24h.toFixed(2)}%`
                        : undefined
                    }
                  >
                    {volumeTone && volumeChange24h != null
                      ? `${volumeTone === "up" ? "+" : "-"}${formatMultiplierMagnitudeFromPercent(volumeChange24h)}X`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd className="rx-num" title={formatUsd(price)}>
                    {formatUsd(price)}
                  </dd>
                </div>
                <div>
                  <dt>Liquidity</dt>
                  <dd className="rx-num">{formatUsd(liq)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="rx-rp-card__meta">
              <span title="Price">
                <span className="rx-num text-rx-text-2">{formatUsd(price)}</span>
              </span>
              <span title="Liquidity">
                <CardIco d={ICO_DROP} />
                <span className="rx-num">{formatUsd(liq)}</span>
              </span>
              <span title="Token age">
                <CardIco d={ICO_CLOCK} />
                {ageLoading ? (
                  <span className="rx-skel inline-block h-3 w-8" role="status" aria-label="Loading age" />
                ) : (
                  `${age} old`
                )}
              </span>
              <Token24hChangeBadge changePct24h={priceChange24h} />
            </div>
          )}

          <div className="rx-rp-card__foot">{reportButtons}</div>

          <div className="rx-rp-card__chart">
            <Token24hSparkline
              changePct24h={priceChange24h}
              seriesY={sparklineY}
              isFetching={sparklinesFetching}
              variant="area"
            />
          </div>
        </article>
        {modals}
      </li>
    );
  }

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
            "rx-num flex items-center py-3 pl-1 pr-1 text-xs text-rx-text-3",
          )}
        >
          {rank}
        </div>

        {/* Token: avatar with chain badge, ticker / quote, copy + explorer, name */}
        <div
          className={clsx(
            SCREENER_PIN_TOKEN,
            SCREENER_ORDER.token,
            "flex min-w-0 items-center gap-2 md:gap-3",
            CELL,
            "max-md:pl-3.5 max-md:pr-2",
          )}
          title={displayName}
        >
          <span className="relative shrink-0">
            <button
              type="button"
              onClick={openChart}
              onKeyDown={keyOpenChart}
              className="rx-avatar rx-avatar--token size-7 cursor-pointer overflow-hidden transition-transform md:size-9 hover:scale-[1.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi disabled:cursor-default"
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
                  className="size-7 object-cover md:size-9"
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
                  <span className="font-normal text-rx-text-3 max-md:hidden">
                    / {baseCurrency}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={handleCopyAddress}
                disabled={!token?.tokenAddress}
                className={clsx(ICON_BTN, "ml-0.5 max-md:hidden")}
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
                  className={clsx(ICON_BTN, "max-md:hidden")}
                  aria-label={`View on ${explorerName}`}
                  title={`View token on ${explorerName}`}
                >
                  <ExternalLink className="size-[13px]" aria-hidden />
                </a>
              ) : null}
            </div>
            <div className="max-w-[230px] truncate text-xs text-rx-text-2 max-md:hidden min-[1800px]:max-w-[360px]">
              {displayName}
            </div>
          </div>
        </div>

        {/* AI reports */}
        <div className={clsx(SCREENER_ORDER.ai, "flex items-center gap-1.5 px-2 py-3")}>
          {reportButtons}
        </div>

        {/* Mcap */}
        <div className={clsx(SCREENER_ORDER.mcap, CELL, "rx-num text-right font-semibold text-rx-text")}>
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
        <div className={clsx(SCREENER_ORDER.chg, CELL, "rx-num flex min-w-0 justify-end")}>
          <Token24hChangeBadge changePct24h={priceChange24h} />
        </div>

        {/* 24h trend */}
        <div className={clsx(SCREENER_ORDER.trend, CELL, "flex justify-end")}>
          <Token24hSparkline
            changePct24h={priceChange24h}
            seriesY={sparklineY}
            isFetching={sparklinesFetching}
          />
        </div>

        {/* Price */}
        <div className={clsx(SCREENER_ORDER.price, CELL, "rx-num text-right font-semibold text-rx-text")}>
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
        <div className={clsx(SCREENER_ORDER.volume, CELL, "rx-num flex flex-col items-end gap-1 text-right")}>
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
        <div className={clsx(SCREENER_ORDER.liquidity, CELL, "rx-num text-right text-rx-text-2")}>
          {formatUsd(liq)}
        </div>

        {/* Age */}
        <div className={clsx(SCREENER_ORDER.age, CELL, "pr-3.5 text-right text-rx-text-2 md:pr-1")}>
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
      {modals}
    </>
  );
}

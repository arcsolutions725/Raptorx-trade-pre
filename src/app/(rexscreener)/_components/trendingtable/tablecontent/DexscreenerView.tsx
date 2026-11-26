/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import copy from "copy-to-clipboard";
import { usePrivy } from "@privy-io/react-auth";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import {
  useReportGenStatus,
  reportGenStore,
} from "@/lib/storage/reportGenStore";
import ExplorerModal from "./ExplorerModal";
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import {
  WhatsNewModal,
  type WhatsNewResult,
} from "@/components/ui/modal/WhatsNewModal";
import { GlossyReportButton } from "./GlossyReportButton";
import {
  dexScreenerTokenImageUrl,
  toDexChainSlug,
  type DexScreenerPair,
} from "@/lib/api/dexscreener";
import { resolveSwapChain } from "@/lib/swapChain";
import { requestShellAction } from "@/components/ui/layout/shellActions";
import { formatUsd } from "@/utils/format";
import {
  chainBadgeFor,
  fromEpochSeconds,
  monogramBackground,
  monogramOf,
  pct24h,
  pickVolume24h,
  shortAddress,
  timeSince,
} from "./tokenMeta";
import "@/styles/pages/token.css";

type DexscreenerViewProps = {
  token: TrendingToken;
  tokenAddress: string;
  title?: string;
  onBack: () => void;
  currentUserId: string;
  /** Lifted from TrendingTableContent so generation survives table → chart transition */
  generateFromToken: (t: TrendingToken) => Promise<unknown>;
};

/** DexScreener embed default interval (15m), matching previous default selection. */
const EMBED_CHART_INTERVAL = "15";

/** Small inline icons (RaptorX design sprite: i-chevr, i-copy, i-check, i-scan, i-expand, i-min). */
function Ico({ d, size = 13, w = 2 }: { d: string; size?: number; w?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const ICO_CHEVR = "M9 6l6 6-6 6";
const ICO_COPY = "M9 9h11v11H9zM5 15H4V4h11v1";
const ICO_CHECK = "M5 12l5 5 9-10";
const ICO_SCAN = "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6";
const ICO_EXPAND = "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7";
const ICO_MIN = "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7";

/** ▲ 7.74% / ▼ 7.74% for the stat strip (plain coloured text, like the design). */
function formatChange(pct: number): string {
  const abs = Math.abs(pct);
  const n =
    abs >= 1000
      ? Math.round(abs).toLocaleString("en-US")
      : abs.toFixed(2);
  return `${pct > 0 ? "▲" : pct < 0 ? "▼" : ""} ${n}%`.trim();
}

export default function DexscreenerView({
  token,
  tokenAddress,
  title,
  onBack,
  currentUserId,
  generateFromToken,
}: DexscreenerViewProps) {
  // Copy address
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );
  const handleCopy = () => {
    if (!tokenAddress) return;
    copy(tokenAddress);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  // Explorer modal state
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams({
      embed: "1",
      theme: "dark",
      info: "0",
      trades: "1",
      tabs: "0",
      chartLeftToolbar: "0",
      loadChartSettings: "0",
      interval: EMBED_CHART_INTERVAL,
    });
    return p;
  }, []);

  const chain = toDexChainSlug(token?.chainId) ?? "solana";

  /**
   * The pair the table's Mcap was read from (/api/trending overlays it from
   * DexScreener). Embedding this exact pair is what keeps the chart's market cap
   * identical to the row's — and it saves a round-trip before the chart appears.
   */
  const rowPairAddress =
    typeof token?.pairAddress === "string" && token.pairAddress
      ? token.pairAddress
      : undefined;

  const {
    data: dexPair,
    isFetching: dexPairFetching,
    isError: dexPairError,
  } = useQuery({
    queryKey: ["dexscreener-embed-pair", chain, tokenAddress],
    queryFn: async (): Promise<DexScreenerPair | null> => {
      // Chain-scoped: without it DexScreener searches every chain and can hand back
      // a pool the row's Mcap was never read from.
      const r = await fetch(
        `/api/dexscreener?contractAddress=${encodeURIComponent(tokenAddress)}&chain=${encodeURIComponent(chain)}`
      );
      const j = (await r.json()) as { error?: string } & Partial<DexScreenerPair>;
      if (!r.ok || (typeof j.error === "string" && j.error)) return null;
      if (!j.pairAddress) return null;
      return j as DexScreenerPair;
    },
    // Only needed as a fallback for rows that arrived without a pair (e.g. a token
    // DexScreener doesn't index, or a stale cached page from before the overlay).
    enabled: Boolean(tokenAddress) && !rowPairAddress,
    staleTime: 120_000,
  });

  const embedChain = (
    dexPair?.chainId ? String(dexPair.chainId).toLowerCase() : chain
  ) as string;
  const embedTarget = rowPairAddress || dexPair?.pairAddress || tokenAddress;
  const awaitingDexPair =
    !rowPairAddress && dexPairFetching && !dexPairError && !dexPair;
  const src = `https://dexscreener.com/${embedChain}/${embedTarget}?${params.toString()}`;

  const explorerUrl =
    chain === "base"
      ? `https://basescan.org/token/${token?.tokenAddress}`
      : chain === "ethereum"
        ? `https://etherscan.io/token/${token?.tokenAddress}`
      : chain === "bsc"
        ? `https://bscscan.com/token/${token?.tokenAddress}`
        : chain === "monad"
          ? `https://monadscan.com/address/${token?.tokenAddress}`
        : chain === "robinhood"
          ? // Robinhood Chain's official explorer is Blockscout (per Li.Fi chain 4663).
            `https://robinhoodchain.blockscout.com/token/${token?.tokenAddress}`
          : `https://solscan.io/token/${token?.tokenAddress}`;

  const explorerName =
    chain === "base"
      ? "BaseScan"
      : chain === "ethereum"
        ? "Etherscan"
        : chain === "bsc"
          ? "BSCScan"
          : chain === "monad"
            ? "MonadScan"
            : chain === "robinhood"
              ? "RobinhoodScan"
              : "SolScan";

  // Token bar: logo (DexScreener icon as fallback, then a monogram), name, quote, stats.
  const constructedLogo = dexScreenerTokenImageUrl(token?.chainId, tokenAddress);
  const [logoSrc, setLogoSrc] = useState<string | undefined>(
    token?.logo || constructedLogo,
  );
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    setLogoFailed(false);
    setLogoSrc(token?.logo || constructedLogo);
  }, [token?.logo, constructedLogo]);
  const showLogo = Boolean(logoSrc) && !logoFailed;

  const chainBadge = chainBadgeFor(token?.chainId);
  const displayName = token?.name ?? token?.symbol ?? "Token";
  const displaySymbol = token?.symbol || displayName;
  /** `title` is "Name / QUOTE" (buildChartTitle); the quote is what the pair trades against. */
  const quoteSymbol =
    title && title.includes(" / ") ? title.split(" / ").pop() : undefined;
  const priceChange24h = pct24h(token?.pricePercentChange);
  const stats: { label: string; value: string; tone?: "up" | "down" }[] = [
    { label: "Price", value: formatUsd(token?.usdPrice) },
    {
      label: "24h",
      value: priceChange24h == null ? "—" : formatChange(priceChange24h),
      tone:
        priceChange24h == null || priceChange24h === 0
          ? undefined
          : priceChange24h > 0
            ? "up"
            : "down",
    },
    { label: "Mcap", value: formatUsd(token?.marketCap) },
    { label: "Volume", value: formatUsd(pickVolume24h(token?.totalVolume)) },
    { label: "Liquidity", value: formatUsd(token?.liquidityUsd) },
    { label: "Age", value: timeSince(fromEpochSeconds(token?.createdAt)) },
  ];

  // Auth + generate (generation hook lives in TrendingTableContent)
  const { authenticated, ready, login } = usePrivy();

  // 🔁 Shared generation status (persists if we came from Table mid-flight)
  const { isGenerating, startedAt } = useReportGenStatus(tokenAddress);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewLoading, setWhatsNewLoading] = useState(false);
  const [whatsNewError, setWhatsNewError] = useState<string | null>(null);
  const [whatsNewResult, setWhatsNewResult] = useState<WhatsNewResult | null>(
    null,
  );
  const whatsNewInFlightRef = useRef(false);

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
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
  }, [isGenerating, startedAt, countdown]);

  useEffect(() => {
    // Clear any existing interval first
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    // Start interval if countdown is set and we're generating
    if (countdown !== null && countdown > 0 && isGenerating) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          // Check store directly to avoid stale closure
          const stillGenerating = reportGenStore.getStartedAt(tokenAddress) > 0;
          if (prev <= 1) return stillGenerating ? 100 : null;
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      };
    }
  }, [countdown, isGenerating, tokenAddress]);

  /**
   * Full-viewport chart. DexScreener's own chart/table splitter lives inside
   * their cross-origin iframe and its drag is swallowed by iOS Safari (the page
   * claims the vertical pan), so iPhone users cannot enlarge the chart at all.
   * This resizes the iframe's container from our side instead, which works the
   * same on every platform.
   */
  const [isChartExpanded, setIsChartExpanded] = useState(false);

  useEffect(() => {
    if (!isChartExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsChartExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    // Lock the page while expanded — also removes anything for iOS to bounce.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isChartExpanded]);

  const handleSignIn = async () => {
    if (!ready) return;
    await login();
  };

  const onGenerateClick = async () => {
    try {
      await generateFromToken(token);
    } catch (err: any) {
      if (err?.status === 402) {
        setShowPaywall(true);
      }
      setCountdown(null);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
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
          contractAddress: tokenAddress,
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

  return (
    <>
      {/* RaptorX token view (design/token.html): breadcrumbs, token bar, then the chart edge to
          edge. Full screen pins the chart panel to the viewport and drops the bar. */}
      <div className={clsx("rx-tk", isChartExpanded && "is-expanded")}>
        <nav className="rx-tk__crumbs" aria-label="Breadcrumb">
          <button type="button" onClick={onBack} title="Back to the token list">
            RexScreener
          </button>
          <Ico d={ICO_CHEVR} size={12} w={2.2} />
          <button type="button" onClick={onBack} title="Back to the token list">
            {chainBadge.label}
          </button>
          <Ico d={ICO_CHEVR} size={12} w={2.2} />
          <span aria-current="page">{displaySymbol}</span>
        </nav>

        <div className="rx-tk__bar">
          <div className="rx-tk__id">
            <span className="rx-tk__avatar">
              <span
                className="rx-avatar rx-avatar--token"
                style={{
                  background: showLogo
                    ? "var(--rx-surface-3)"
                    : monogramBackground(tokenAddress || displaySymbol),
                }}
              >
                {showLogo ? (
                  <Image
                    src={logoSrc as string}
                    alt=""
                    width={44}
                    height={44}
                    onError={() => {
                      if (logoSrc && constructedLogo && logoSrc !== constructedLogo) {
                        setLogoSrc(constructedLogo);
                        return;
                      }
                      setLogoFailed(true);
                    }}
                  />
                ) : (
                  <span aria-hidden="true">{monogramOf(displaySymbol)}</span>
                )}
              </span>
              <span className="rx-avatar__chain" title={chainBadge.label}>
                <Image src={chainBadge.src} alt={chainBadge.label} width={16} height={16} />
              </span>
            </span>
            <div className="rx-tk__title">
              <h1 title={quoteSymbol ? `${displayName} / ${quoteSymbol}` : displayName}>
                {displayName}
                {quoteSymbol ? <span> / {quoteSymbol}</span> : null}
              </h1>
              {tokenAddress ? (
                <span className="rx-tk__addr rx-num">
                  {shortAddress(tokenAddress)}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={clsx("rx-tk__copy", copied && "is-done")}
                    aria-label={
                      copied ? "Contract address copied" : `Copy address ${tokenAddress}`
                    }
                    title="Copy contract address"
                  >
                    <Ico d={copied ? ICO_CHECK : ICO_COPY} w={copied ? 2.6 : 2} />
                  </button>
                </span>
              ) : null}
            </div>
          </div>

          <dl className="rx-tk__stats">
            {stats.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd className={s.tone ? `is-${s.tone}` : undefined} title={s.value}>
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="rx-tk__tools">
            {isGenerating && countdown !== null ? (
              <span
                role="status"
                aria-live="polite"
                aria-label={`Generating report, ${countdown} seconds left`}
                className="rx-btn rx-btn--report rx-btn--s pointer-events-none min-w-[112px] font-bold tabular-nums"
              >
                <span className="rx-spin size-3 border-[1.5px]" aria-hidden />
                {countdown}s
              </span>
            ) : (
              <GlossyReportButton
                label="Full Report"
                variant="full-report"
                onClick={!authenticated ? handleSignIn : onGenerateClick}
                disabled={isGenerating || !ready || whatsNewLoading}
                ariaLabel="Full Report"
              />
            )}
            <GlossyReportButton
              label="What's New"
              variant="whats-new"
              onClick={!authenticated ? handleSignIn : onWhatsNewClick}
              disabled={!ready || whatsNewLoading}
              loading={whatsNewLoading}
              ariaLabel={`What's New for ${token?.symbol || title || "token"}`}
            />
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rx-icon-btn rx-tk__ctl"
              aria-label={`View on ${explorerName}`}
              title={`View token on ${explorerName}`}
            >
              <Ico d={ICO_SCAN} size={14} />
            </a>
            {/* Opens/closes Rex Pilot (the page title with its Claw AI 5.0 button is hidden on token pages) */}
            <button
              type="button"
              className="rx-btn rx-btn--claw rx-btn--s"
              onClick={() => requestShellAction("pilot")}
              aria-label="Claw AI 5.0: open Rex Pilot"
            >
              <Image
                src="/images/claw-logo-96.webp"
                alt=""
                width={20}
                height={20}
                className="claw-ico"
              />
              Claw AI 5.0
            </button>
          </div>
        </div>

        <section className="rx-tk__chart" aria-label="Price chart">
          <div className="rx-tk__head">
            <b>
              {displaySymbol}
              {quoteSymbol ? ` / ${quoteSymbol}` : ""}
            </b>
            <span className="rx-small rx-tk__sub">Price chart and trades</span>
            <span className="rx-eyebrow">Chart by DexScreener</span>
            {/* `group` + `relative` anchor the tooltip; no native `title` here or
                the browser would draw its own tooltip on top of ours. */}
            <div className="group relative shrink-0">
              <button
                type="button"
                onClick={() => setIsChartExpanded((v) => !v)}
                className="rx-icon-btn rx-tk__ctl"
                aria-label={
                  isChartExpanded ? "Exit full screen chart" : "Expand chart"
                }
                aria-pressed={isChartExpanded}
              >
                <Ico d={isChartExpanded ? ICO_MIN : ICO_EXPAND} />
              </button>

              {/* Opens downward: the button sits at the top of the panel, so an
                  upward tooltip would clip against the header's edge. */}
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-[80] mt-2 translate-y-1 scale-95 opacity-0 transition-all duration-150 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 motion-reduce:transition-none"
              >
                <div className="relative whitespace-nowrap rounded-[10px] border border-rx-line-strong bg-[#1D1C1B] px-2.5 py-1.5 text-xs font-medium text-rx-text shadow-[var(--rx-depth-3)]">
                  {isChartExpanded ? (
                    <>
                      Exit full screen
                      <span className="ml-1.5 rounded border border-rx-line-strong bg-white/[0.06] px-1 py-px font-mono text-[10px] text-rx-text-2">
                        Esc
                      </span>
                    </>
                  ) : (
                    "Full screen"
                  )}
                  {/* Arrow: a rotated square, masked to look like a notch. */}
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 right-3 h-2 w-2 rotate-45 border-l border-t border-rx-line-strong bg-[#1D1C1B]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DexScreener expects the liquidity pair address in the path, not the token contract. */}
          <div className="rx-tk__body">
            {awaitingDexPair ? (
              <div className="rx-tk__loading" role="status">
                <span className="rx-spin text-rx-gold" aria-hidden />
                <span>Loading chart…</span>
              </div>
            ) : (
              <iframe
                key={src}
                src={src}
                title="Dexscreener Chart"
                style={{ width: "100%", height: "100%", border: 0 }}
                loading="eager"
                allow="clipboard-write"
              />
            )}
          </div>
        </section>
      </div>

      {/* Explorer Modal */}
      <ExplorerModal
        isOpen={isExplorerOpen}
        onClose={() => setIsExplorerOpen(false)}
        tokenAddress={tokenAddress}
        chainId={token?.chainId}
        tokenName={token?.name || token?.symbol}
      />
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
        imageUrl={token.logo}
        symbol={token.symbol}
        facts={{
          priceUsd: token?.usdPrice ?? null,
          change24h: priceChange24h ?? null,
          marketCap: token?.marketCap ?? null,
          volume24h: pickVolume24h(token?.totalVolume) ?? null,
          liquidityUsd: token?.liquidityUsd ?? null,
          createdAt: fromEpochSeconds(token?.createdAt)?.getTime() ?? null,
          contract: tokenAddress || token?.tokenAddress || null,
        }}
        trade={
          token.symbol && (tokenAddress || token.tokenAddress)
            ? {
                symbol: token.symbol,
                name: token.name,
                logo: token.logo,
                chain: resolveSwapChain({
                  swapTokenAddress: tokenAddress || token.tokenAddress,
                  token,
                }),
                // This chart's token is the panel's swap target: open the panel's Exchange.
                onTrade: () => {
                  requestShellAction("exchange");
                },
              }
            : null
        }
      />
    </>
  );
}

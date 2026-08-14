/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import copy from "copy-to-clipboard";
import {
  Copy,
  Check,
  ExternalLink,
  ArrowLeft,
  Maximize2,
  Minimize2,
} from "lucide-react";
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
import { toDexChainSlug, type DexScreenerPair } from "@/lib/api/dexscreener";

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

/** Same box as the table Generate control so the header does not jump. */
const REPORT_BTN_SLOT_CLASS =
  "flex h-7.5 w-17.5 shrink-0 items-center justify-center overflow-hidden";

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
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setWhatsNewResult({
        summary: String(json.summary || ""),
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
    <div
      className={
        isChartExpanded
          ? // `fixed inset-0` rather than a 100vh height: iOS Safari's 100vh
            // overshoots the visible viewport under the browser chrome.
            // z-[70] clears the report sidebar (z-[60]) and its overlay (z-50).
            "fixed inset-0 z-[70] flex flex-col w-full overflow-hidden bg-black"
          : "flex flex-col w-full h-[calc(100vh-195px)] overflow-hidden"
      }
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center gap-5 min-[1340px]:gap-0 justify-between p-3 bg-black/50 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-center w-full sm:w-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center gap-1 rounded-lg cursor-pointer text-[14px]"
            >
              <ArrowLeft className="w-4 h-4" color="white" />
            </button>

            <div className="text-white/90 font-semibold">
              {title ?? "Rexscreener Chart"}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center rounded px-1.5 py-1 hover:bg-white/10 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/30"
              aria-label={`Copy address ${tokenAddress}`}
              title="Copy contract address"
            >
              {copied ? (
                <Check className="w-4 h-4" color="white" />
              ) : (
                <Copy className="w-4 h-4" color="white" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isGenerating && countdown !== null ? (
              <div className="flex items-center gap-1">
                <div className={REPORT_BTN_SLOT_CLASS}>
                  <div className="text-[#FFD700] font-bold text-sm animate-pulse">
                    {countdown}s
                  </div>
                </div>
                <GlossyReportButton
                  label="What's New"
                  variant="whats-new"
                  onClick={!authenticated ? handleSignIn : onWhatsNewClick}
                  disabled={!ready || whatsNewLoading}
                  ariaLabel={`What's New for ${token?.symbol || title || "token"}`}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <GlossyReportButton
                  label="Full Report"
                  variant="full-report"
                  onClick={!authenticated ? handleSignIn : onGenerateClick}
                  disabled={isGenerating || !ready || whatsNewLoading}
                  ariaLabel="Full Report"
                />
                <GlossyReportButton
                  label="What's New"
                  variant="whats-new"
                  onClick={!authenticated ? handleSignIn : onWhatsNewClick}
                  disabled={!ready || whatsNewLoading}
                  ariaLabel={`What's New for ${token?.symbol || title || "token"}`}
                />
              </div>
            )}
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-6 w-6 shrink-0 border-[0.5px] flex items-center justify-center gap-1.5 font-medium! text-[14px]! rounded-lg text-[#F9B80C] transition-colors cursor-pointer hover:text-[#6D4F03]"
              aria-label={`View on ${explorerName}`}
              title={`View token on ${explorerName}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {/* `group` + `relative` anchor the tooltip; no native `title` here or
                the browser would draw its own tooltip on top of ours. */}
            <div className="relative group shrink-0">
              <button
                type="button"
                onClick={() => setIsChartExpanded((v) => !v)}
                className="h-6 w-6 shrink-0 border-[0.5px] flex items-center justify-center gap-1.5 font-medium! text-[14px]! rounded-lg text-[#F9B80C] transition-colors cursor-pointer hover:text-[#6D4F03]"
                aria-label={
                  isChartExpanded ? "Exit full screen chart" : "Expand chart"
                }
                aria-pressed={isChartExpanded}
              >
                {isChartExpanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Opens downward: the button sits at the top of the panel, so an
                  upward tooltip would clip against the header's edge. */}
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-[80] mt-2 translate-y-1 scale-95 opacity-0 transition-all duration-150 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
              >
                <div className="relative whitespace-nowrap rounded-lg border border-[#F9B80C]/40 bg-[#141414] px-2.5 py-1.5 text-[11px] font-medium text-[#F9B80C] shadow-lg shadow-black/60">
                  {isChartExpanded ? (
                    <>
                      Exit full screen
                      <span className="ml-1.5 rounded border border-white/15 bg-white/10 px-1 py-px text-[10px] text-white/70">
                        Esc
                      </span>
                    </>
                  ) : (
                    "Expand chart"
                  )}
                  {/* Arrow: a rotated square, masked to look like a notch. */}
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 right-2.5 h-2 w-2 rotate-45 border-l border-t border-[#F9B80C]/40 bg-[#141414]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DexScreener expects the liquidity pair address in the path, not the token contract. */}
      <div className="relative flex-1 overflow-hidden bg-neutral-900">
        {awaitingDexPair ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80 text-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FFD700]" />
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
      />
    </div>
  );
}

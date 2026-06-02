/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import copy from "copy-to-clipboard";
import { Copy, Check, ExternalLink, ArrowLeft } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import {
  useReportGenStatus,
  reportGenStore,
} from "@/lib/storage/reportGenStore";
import ExplorerModal from "./ExplorerModal";
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import type { DexScreenerPair } from "@/lib/api/dexscreener";

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

/** Same box for countdown / generate / generated so the control does not jump. */
const REPORT_BTN_SLOT_CLASS =
  "flex h-7 w-[112px] shrink-0 items-center justify-center overflow-hidden sm:w-[124px]";

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

  const lowerChainId = token?.chainId?.toLowerCase();
  const chain =
    lowerChainId === "base" || token?.chainId === "8453"
      ? "base"
      : lowerChainId === "bsc" || token?.chainId === "56"
        ? "bsc"
        : lowerChainId === "ethereum" ||
            lowerChainId === "eth" ||
            token?.chainId === "1"
          ? "ethereum"
        : lowerChainId === "monad" || token?.chainId === "10143"
          ? "monad"
          : "solana";

  const {
    data: dexPair,
    isFetching: dexPairFetching,
    isError: dexPairError,
  } = useQuery({
    queryKey: ["dexscreener-embed-pair", chain, tokenAddress],
    queryFn: async (): Promise<DexScreenerPair | null> => {
      const r = await fetch(
        `/api/dexscreener?contractAddress=${encodeURIComponent(tokenAddress)}`
      );
      const j = (await r.json()) as { error?: string } & Partial<DexScreenerPair>;
      if (!r.ok || (typeof j.error === "string" && j.error)) return null;
      if (!j.pairAddress) return null;
      return j as DexScreenerPair;
    },
    enabled: Boolean(tokenAddress),
    staleTime: 120_000,
  });

  const embedChain = (
    dexPair?.chainId ? String(dexPair.chainId).toLowerCase() : chain
  ) as string;
  const embedTarget = dexPair?.pairAddress || tokenAddress;
  const awaitingDexPair = dexPairFetching && !dexPairError && !dexPair;
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
          : `https://solscan.io/token/${token?.tokenAddress}`;

  // Auth + generate (generation hook lives in TrendingTableContent)
  const { authenticated, ready, login } = usePrivy();

  // 🔁 Shared generation status (persists if we came from Table mid-flight)
  const { isGenerating, startedAt } = useReportGenStatus(tokenAddress);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

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
      setHasGenerated(true);
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

  const handleSignIn = async () => {
    if (!ready) return;
    await login();
  };

  const onGenerateClick = async () => {
    try {
      const result = await generateFromToken(token);
      if (result !== undefined) setHasGenerated(true);
    } catch (err: any) {
      if (err?.status === 402) {
        setShowPaywall(true);
      }
      setCountdown(null);
      setHasGenerated(false);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-195px)] overflow-hidden">
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
              <div className={REPORT_BTN_SLOT_CLASS}>
                <div className="text-[#FFD700] font-bold text-sm animate-pulse">
                  {countdown}s
                </div>
              </div>
            ) : hasGenerated ? (
              <div
                className={REPORT_BTN_SLOT_CLASS}
                role="status"
                aria-label="Report generated"
              >
                <Image
                  src="/images/btn_generated.webp"
                  alt="Report generated"
                  width={112}
                  height={39}
                  className="h-full w-full max-h-full object-contain object-center"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={!authenticated ? handleSignIn : onGenerateClick}
                disabled={isGenerating || !ready}
                className={`${REPORT_BTN_SLOT_CLASS} p-0 transition bg-transparent border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F9B80C]/50 rounded-lg ${
                  isGenerating || !ready
                    ? "opacity-60 cursor-wait"
                    : "cursor-pointer hover:opacity-90"
                }`}
                aria-label="Generate AI Report"
                title="Generate AI Report"
              >
                <Image
                  src="/images/btn_generate.webp"
                  alt="Generate AI Report"
                  width={112}
                  height={39}
                  className="h-full w-full max-h-full object-contain object-center"
                />
              </button>
            )}
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-6 w-6 shrink-0 border-[0.5px] flex items-center justify-center gap-1.5 font-medium! text-[14px]! rounded-lg text-[#F9B80C] transition-colors cursor-pointer hover:text-[#6D4F03]"
              aria-label={`View on ${
                chain === "base"
                  ? "BaseScan"
                  : chain === "ethereum"
                    ? "Etherscan"
                  : chain === "bsc"
                    ? "BSCScan"
                    : chain === "monad"
                      ? "MonadScan"
                      : "SolScan"
              }`}
              title={`View token on ${
                chain === "base"
                  ? "BaseScan"
                  : chain === "ethereum"
                    ? "Etherscan"
                  : chain === "bsc"
                    ? "BSCScan"
                    : chain === "monad"
                      ? "MonadScan"
                      : "SolScan"
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
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
    </div>
  );
}

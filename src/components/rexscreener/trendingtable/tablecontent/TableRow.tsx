/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { formatUsd } from "@/lib/utils/format";
import { useGenerateRexReport } from "@/hooks/useGenerateRexReport";
import { usePrivy } from "@privy-io/react-auth";
import copy from "copy-to-clipboard";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useReportGenStatus, reportGenStore } from "@/lib/storage/reportGenStore";

function fromEpochSeconds(sec?: number): Date | null {
  return typeof sec === "number" ? new Date(sec * 1000) : null;
}
function timeSince(date: Date | null): string {
  if (!date) return "—";
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const y = Math.floor(s / (365 * 24 * 3600));
  if (y >= 1) return `${y}y`;
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
function formatGeneratedAt(date = new Date()): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const Y = date.getFullYear();
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

type Props = {
  token?: TrendingToken;
  lastGeneratedOn?: string | null;
  rank: number | string;
  onReportGenerated?: (report: any) => void;
  onOpenChart?: (token: TrendingToken) => void;
  currentUserId: string;
  isAdmin: boolean;
  index?: number;
};

export function TableRow({
  token,
  lastGeneratedOn,
  rank,
  onReportGenerated,
  onOpenChart,
  currentUserId,
  isAdmin,
  index = 0,
}: Props) {
  const [localLastGeneratedOn, setLocalLastGeneratedOn] = useState<
    string | null
  >(lastGeneratedOn ?? null);
  useEffect(() => {
    if (lastGeneratedOn) setLocalLastGeneratedOn(lastGeneratedOn);
  }, [lastGeneratedOn]);

  const { generateFromToken, adminGenerateAndStoreFromToken } =
    useGenerateRexReport({
      onReportGenerated: (r) => {
        setLocalLastGeneratedOn(formatGeneratedAt());
        onReportGenerated?.(r);
      },
      userId: currentUserId,
    });

  const { isGenerating, startedAt } = useReportGenStatus(token?.tokenAddress);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const displayName = token?.name ?? token?.symbol ?? "Unknown";
  const displaySymbol = token?.symbol ? `${token.symbol}` : "";
  const price = token?.usdPrice;
  const mcap = token?.marketCap;
  const vol = pickVolume24h(token?.totalVolume);
  const liq = token?.liquidityUsd;
  const age = timeSince(fromEpochSeconds(token?.createdAt));
  const logoImage = token?.logo;

  const isBnbChain =
    token?.chainId?.toLowerCase() === "bsc" || token?.chainId === "56";
  const baseCurrency = isBnbChain ? "WBNB" : "SOL";
  const explorerUrl = isBnbChain
    ? `https://bscscan.com/token/${token?.tokenAddress}`
    : `https://solscan.io/token/${token?.tokenAddress}`;

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
    try {
      await generateFromToken(token);
      setLocalLastGeneratedOn((existing) => existing ?? formatGeneratedAt());
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

  const onAdminGenerateAndStoreClick = async () => {
    if (!token) return;
    try {
      await adminGenerateAndStoreFromToken(token, {
        confirmOverwrite: async (msg) => window.confirm(msg),
      });
      setLocalLastGeneratedOn((existing) => existing ?? formatGeneratedAt());
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
    <div className={`grid [grid-template-columns:minmax(300px,1.5fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] sm:[grid-template-columns:minmax(400px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] items-center px-0 py-0 text-sm text-white/90 text-[14px]`}>
      {/* Token */}
      <div
        className={`sm:sticky sm:left-0 sm:z-10 flex items-center px-3 py-2 gap-2 whitespace-nowrap truncate ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}
        title={displayName}
      >
        <div className="pr-2 shrink-0 text-[#A0A0A5]">{`#${rank}`}</div>

        {logoImage ? (
          <button
            type="button"
            onClick={openChart}
            onKeyDown={keyOpenChart}
            className="pl-3 w-[35px] h-[35px] outline-none cursor-pointer group !py-0 !px-0 shrink-0 hidden sm:block"
            aria-label={`Open chart for ${displayName}`}
            title="Open chart"
          >
            <Image
              src={logoImage}
              alt="token logo"
              width={35}
              height={35}
              className="group-hover:scale-[1.05] transition cursor-pointer"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={openChart}
            onKeyDown={keyOpenChart}
            className="pl-3 text-blue-300 underline hover:opacity-80 shrink-0 hidden sm:inline"
            disabled={!token?.tokenAddress}
            title="Open chart"
          >
            Chart
          </button>
        )}

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

        <button
          type="button"
          onClick={handleCopyAddress}
          disabled={!token?.tokenAddress}
          className="ml-2 inline-flex items-center justify-center rounded px-1.5 py-1 active:scale-95 focus:outline-none shrink-0"
          title={token?.tokenAddress ? "Copy contract address" : "No address"}
        >
          {copied ? (
            <Check className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Market Cap */}
      <div className={`sm:sticky sm:left-[400px] h-[51px] items-center sm:z-10 flex justify-center px-3 py-2 whitespace-nowrap truncate ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        <span className="!font-bold">{formatUsd(mcap)}</span>
      </div>

      {/* AI Report */}
      <div className={`sm:sticky sm:left-[540px] h-[51px] sm:z-10 flex items-center justify-center px-3 py-2 whitespace-nowrap ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        {isGenerating && countdown !== null ? (
          <div className="flex flex-col items-center">
            <div className="text-[#FFD700] font-bold text-lg animate-pulse">
              {countdown}s
            </div>
          </div>
        ) : hasGenerated ? (
          <div className="flex items-center justify-center w-[78px] h-[32px] rounded-sm bg-[#FFD700]">
            <span className="text-black !font-bold text-sm">
              {isAdmin ? "Stored!" : "Generated!"}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={!authenticated ? handleSignIn : onGenerateClick}
              disabled={isGenerating || !ready}
              className={`w-[70px] h-[30px] flex items-center justify-center transition ${
                isGenerating || !ready
                  ? "opacity-60 cursor-wait"
                  : "cursor-pointer"
              }`}
              aria-label={`Generate report for ${displayName}`}
              style={{ flexShrink: 0 }}
            >
              <Image
                src="/images/generate.png"
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
              className="flex items-center justify-center gap-1.5 !font-medium !text-[14px] rounded-[8px] text-[#ffc000] transition-colors cursor-pointer hover:text-[#ffda44]"
              aria-label={`View on ${isBnbChain ? "BSCScan" : "SolScan"}`}
              title={`View token on ${isBnbChain ? "BSCScan" : "SolScan"}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Volume */}
      <div className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-[51px] items-center ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        <span className="!font-bold">{formatUsd(vol)}</span>
      </div>

      {/* Price */}
      <div className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-[51px] items-center ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        <span className="!font-bold">{formatUsd(price)}</span>
      </div>

      {/* Liquidity */}
      <div className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-[51px] items-center ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        <span className="!font-bold">{formatUsd(liq)}</span>
      </div>

      {/* Age */}
      <div className={`flex justify-center px-3 py-2 whitespace-nowrap truncate h-[51px] items-center ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        <span className="!font-bold">{age}</span>
      </div>

      {/* Last Generated On */}
      <div className={`px-3 py-2 whitespace-nowrap truncate h-[51px] items-center ${isEvenRow ? 'bg-[#191919]' : 'bg-black'}`}>
        <span className="!font-bold">{localLastGeneratedOn ?? ""}</span>
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { formatUsd } from "@/lib/utils/format";
import { useGenerateRexReport } from "@/hooks/useGenerateRexReport";
import { usePrivy } from "@privy-io/react-auth";
import copy from "copy-to-clipboard";
import { Copy, Check } from "lucide-react";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";

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
};

export function TableRow({
  token,
  lastGeneratedOn,
  rank,
  onReportGenerated,
  onOpenChart,
  currentUserId,
  isAdmin,
}: Props) {
  // ✅ Hooks must always run (no early return above)
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

  // 🔁 Shared generation state (persists across views)
  const { isGenerating, startedAt } = useReportGenStatus(token?.tokenAddress);

  // Countdown UX (resumes if we mount mid-flight)
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setHasGenerated(true);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isGenerating, startedAt, countdown]);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) return isGenerating ? 100 : null;
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
  }, [countdown, isGenerating]);

  const { authenticated, ready, login } = usePrivy();

  // Copy
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    []
  );

  // Safe token-derived values
  const displayName = token?.name ?? token?.symbol ?? "Unknown";
  const displaySymbol = token?.symbol ? `${token.symbol}` : "";
  const price = token?.usdPrice;
  const mcap = token?.marketCap;
  const vol = pickVolume24h(token?.totalVolume);
  const liq = token?.liquidityUsd;
  const age = timeSince(fromEpochSeconds(token?.createdAt));
  const logoImage = token?.logo;
  
  // Determine base currency based on chain
  const isBnbChain = token?.chainId?.toLowerCase() === "bsc" || token?.chainId === "56";
  const baseCurrency = isBnbChain ? "WBNB" : "SOL";

  const openChart = () => {
    // OPTIONAL: block navigation while generating this token
    // if (isGenerating) return;
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
      setCountdown(100); // visual kickstart (effect keeps it in sync)
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
      setCountdown(100);
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

  // 🧹 If there is no token, render nothing — but AFTER all hooks ran.
  if (!token) return null;

  return (
    <div className="grid [grid-template-columns:260px_120px_120px_120px_120px_120px_100px_200px] sm:[grid-template-columns:360px_120px_120px_120px_120px_120px_100px_200px] items-center bg-black px-0 py-0 text-sm text-white/90 border-b border-white/10">
      {/* Token */}
      <div
        className="sm:sticky sm:left-0 sm:z-10 flex items-center px-3 py-2 whitespace-nowrap truncate border-r border-white/10 bg-black"
        title={displayName}
      >
        <div className="pr-2 shrink-0">{`#${rank}`}</div>

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
            <span className="!font-bold leading-tight truncate">
              {displaySymbol ? `${displaySymbol}/${baseCurrency}` : baseCurrency}
            </span>
            <span className="text-[#ffc000] !font-bold leading-tight truncate">
              {displayName}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyAddress}
          disabled={!token?.tokenAddress}
          className="ml-2 inline-flex items-center justify-center rounded px-1.5 py-1 active:scale-95 focus:outline-none shrink-0"
          aria-label={
            token?.tokenAddress
              ? `Copy address ${token.tokenAddress}`
              : "No address"
          }
          title={token?.tokenAddress ? "Copy contract address" : "No address"}
        >
          {copied ? (
            <Check className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Mcap */}
      <div className="sm:sticky sm:left-[360px] h-[51px] items-center sm:z-10 flex justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/10 bg-black">
        <span className="!font-bold">{formatUsd(mcap)}</span>
      </div>

      {/* AI Report */}
      <div className="sm:sticky sm:left-[480px] h-[51px] sm:z-10 flex items-center justify-center px-3 py-2 whitespace-nowrap border-r border-white/10 bg-black">
        {isGenerating && countdown !== null ? (
          <div className="flex flex-col items-center">
            <div className="text-[#FFD700] font-bold text-lg animate-pulse">
              {countdown}s
            </div>
          </div>
        ) : hasGenerated ? (
          isAdmin ? (
            <div className="flex items-center justify-center w-[78px] h-[32px] rounded-sm bg-[#FFD700]">
              <span className="text-black !font-bold text-sm">Stored!</span>
            </div>
          ) : (
            <div className="flex items-center justify-center w-[78px] h-[32px] rounded-sm bg-[#FFD700]">
              <span className="text-black !font-bold text-sm">Generated!</span>
            </div>
          )
        ) : (
          <>
            {isAdmin ? (
              <button
                type="button"
                onClick={
                  !authenticated ? handleSignIn : onAdminGenerateAndStoreClick
                }
                disabled={isGenerating || !ready}
                className={`px-0.5 py-1.5 rounded text-black !font-semibold bg-[#00b050] text-sm hover:bg-[#00b050] transition ${
                  isGenerating || !ready
                    ? "opacity-60 cursor-wait"
                    : "cursor-pointer"
                }`}
                aria-label={`Generate and store report for ${displayName}`}
              >
                Generate Store
              </button>
            ) : (
              <button
                type="button"
                onClick={!authenticated ? handleSignIn : onGenerateClick}
                disabled={isGenerating || !ready}
                className={`px-3 transition ${
                  isGenerating || !ready
                    ? "opacity-60 cursor-wait"
                    : "cursor-pointer"
                }`}
                aria-label={`Generate report for ${displayName}`}
              >
                <Image
                  src="/images/generate.png"
                  alt="generate report"
                  width={100}
                  height={40}
                  className="hover:scale-[1.05] transition"
                />
              </button>
            )}
          </>
        )}
      </div>

      {/* Vol */}
      <div className="flex justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/10 h-[51px] items-center">
        <span className="!font-bold">{formatUsd(vol)}</span>
      </div>

      {/* Price */}
      <div className="flex justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/10 h-[51px] items-center">
        <span className="!font-bold">{formatUsd(price)}</span>
      </div>

      {/* Liquidity */}
      <div className="flex justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/10 h-[51px] items-center">
        <span className="!font-bold">{formatUsd(liq)}</span>
      </div>

      {/* Age */}
      <div className="flex justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/10 h-[51px] items-center">
        <span className="!font-bold">{age}</span>
      </div>

      {/* Last Generated On */}
      <div className="px-3 py-2 whitespace-nowrap truncate h-[51px] items-center">
        <span className="!font-bold">{localLastGeneratedOn ?? ""}</span>
      </div>
    </div>
  );
}

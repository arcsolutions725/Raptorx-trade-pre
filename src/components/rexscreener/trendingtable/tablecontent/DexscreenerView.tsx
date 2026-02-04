/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import copy from "copy-to-clipboard";
import {
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { useGenerateRexReport } from "@/hooks/useGenerateRexReport";
import { usePrivy } from "@privy-io/react-auth";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import {
  useReportGenStatus,
  reportGenStore,
} from "@/lib/storage/reportGenStore";
import ExplorerModal from "./ExplorerModal";

type DexscreenerViewProps = {
  token: TrendingToken;
  tokenAddress: string;
  title?: string;
  onBack: () => void;
  currentUserId: string;
  onReportGenerated?: (report: any) => void;
};

type IntervalItem = {
  key: string;
  label: string;
  value: string;
  supported: boolean;
};

const GROUPS: { title: string; items: IntervalItem[] }[] = [
  {
    title: "SECONDS",
    items: [
      { key: "1s", label: "1 seconds", value: "1", supported: true },
      { key: "15s", label: "15 seconds", value: "15S", supported: true },
      { key: "30s", label: "30 seconds", value: "30S", supported: true },
    ],
  },
  {
    title: "MINUTES",
    items: [
      { key: "1m", label: "1 minute", value: "1", supported: true },
      { key: "3m", label: "3 minutes", value: "3", supported: true },
      { key: "5m", label: "5 minutes", value: "5", supported: true },
      { key: "15m", label: "15 minutes", value: "15", supported: true },
      { key: "30m", label: "30 minutes", value: "30", supported: true },
    ],
  },
  {
    title: "HOUR",
    items: [
      { key: "1h", label: "1 hour", value: "60", supported: true },
      { key: "2h", label: "2 hours", value: "120", supported: true },
      { key: "4h", label: "4 hours", value: "240", supported: true },
      { key: "8h", label: "8 hours", value: "480", supported: true },
      { key: "12h", label: "12 hours", value: "720", supported: true },
    ],
  },
  {
    title: "DAYS",
    items: [
      { key: "D", label: "1 day", value: "1D", supported: true },
      { key: "3D", label: "3 days", value: "3D", supported: true },
      { key: "W", label: "1 week", value: "1W", supported: true },
      { key: "M", label: "1 month", value: "1M", supported: true },
    ],
  },
];

const QUICK: string[] = ["1m", "5m", "15m", "1h", "4h", "D"];
function findInterval(key: string): IntervalItem | undefined {
  for (const g of GROUPS) {
    const it = g.items.find((x) => x.key === key);
    if (it) return it;
  }
  return undefined;
}

export default function DexscreenerView({
  token,
  tokenAddress,
  title,
  onBack,
  currentUserId,
  onReportGenerated,
}: DexscreenerViewProps) {
  // Copy address
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    []
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

  // Chart interval
  const [intervalKey, setIntervalKey] = useState<string>("15m");
  const selected = useMemo(
    () => findInterval(intervalKey) ?? findInterval("15m")!,
    [intervalKey]
  );
  const params = useMemo(() => {
    const p = new URLSearchParams({
      embed: "1",
      theme: "dark",
      info: "0",
      trades: "1",
      tabs: "0",
      chartLeftToolbar: "0",
      loadChartSettings: "0",
      interval: selected.value,
    });
    return p;
  }, [selected.value]);

  const chain =
    token?.chainId?.toLowerCase() === "bsc" || token?.chainId === "56"
      ? "bsc"
      : "solana";
  const src = `https://dexscreener.com/${chain}/${tokenAddress}?${params.toString()}`;

  const explorerUrl =
    chain === "bsc"
      ? `https://bscscan.com/token/${token?.tokenAddress}`
      : `https://solscan.io/token/${token?.tokenAddress}`;

  // Dropdown
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Auth + generate
  const { authenticated, ready, login } = usePrivy();
  const { generateFromToken } = useGenerateRexReport({
    onReportGenerated: (r) => onReportGenerated?.(r),
    userId: currentUserId,
  });

  // 🔁 Shared generation status (persists if we came from Table mid-flight)
  const { isGenerating, startedAt } = useReportGenStatus(tokenAddress);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      await generateFromToken(token);
      setHasGenerated(true);
      onReportGenerated?.(null);
    } catch {
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center gap-1 w-[40px] h-[40px] bg-[#3C3C3C] rounded-[8px] cursor-pointer text-[14px]"
          >
            <ArrowLeft className="w-5 h-5" color="white" />
          </button>

          <div className="text-white/90 font-semibold">
            {title ?? "Dexscreener Chart"}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center rounded px-1.5 py-1 border border-white/20 hover:bg-white/10 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/30"
            aria-label={`Copy address ${tokenAddress}`}
            title="Copy contract address"
          >
            {copied ? (
              <Check className="w-4 h-4" color="white" />
            ) : (
              <Copy className="w-4 h-4" color="white" />
            )}
          </button>

          {/* Generate and Explorer buttons */}
          {isGenerating && countdown !== null ? (
            <div className="flex items-center">
              <div className="text-[#FFD700] font-bold text-lg animate-pulse">
                {countdown}s
              </div>
            </div>
          ) : hasGenerated ? (
            <div className="flex items-center justify-center w-[86px] h-[32px] rounded-sm bg-[#FFD700]">
              <span className="text-black !font-bold text-sm">Generated!</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={!authenticated ? handleSignIn : onGenerateClick}
                disabled={isGenerating || !ready}
                className={`px-2 transition w-[83px] h-[40px] flex items-center justify-center !font-bold bg-[#000] !text-[14px] border border-[#6D4F03] rounded-[12px] text-[#F9B80C] ${
                  isGenerating || !ready
                    ? "opacity-60 cursor-wait"
                    : "cursor-pointer"
                }`}
                aria-label="Generate AI Report"
                title="Generate AI Report"
              >
                Generate
              </button>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 h-[40px] w-[40px] border-[0.5px] flex items-center justify-center gap-1.5 !font-medium !text-[14px] rounded-[8px] text-[#F9B80C] transition-colors cursor-pointer hover:text-[#6D4F03]"
                aria-label={`View on ${
                  chain === "bsc" ? "BSCScan" : "SolScan"
                }`}
                title={`View token on ${
                  chain === "bsc" ? "BSCScan" : "SolScan"
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </>
          )}
        </div>

        <div className="relative flex items-center justify-end min-[1340px]:justify-center gap-1.5 min-[1340px]:w-auto">
          {QUICK.map((k) => {
            const it = findInterval(k)!;
            const active = intervalKey === k;
            const disabled = !it.supported;
            return (
              <button
                key={k}
                type="button"
                disabled={disabled}
                onClick={() => setIntervalKey(k)}
                className={[
                  "px-2 py-1 rounded border text-xs",
                  disabled
                    ? "opacity-40 cursor-not-allowed border-white/10 text-white/50"
                    : active
                    ? "border-white/60 bg-white/10 text-white"
                    : "border-white/15 hover:bg-white/10 text-white/80",
                ].join(" ")}
                title={
                  disabled && (k.endsWith("s") || it.value.endsWith("S"))
                    ? "Dexscreener iframe doesn't support seconds"
                    : `Set interval to ${it.label}`
                }
              >
                {k}
              </button>
            );
          })}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="px-2 py-1 rounded border text-xs border-white/15 hover:bg-white/10 inline-flex items-center gap-1 text-white/80"
              aria-haspopup="menu"
              aria-expanded={open}
              title="More intervals"
            >
              <span>▼</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 max-h-96 overflow-auto rounded-md border border-white/15 bg-black/90 backdrop-blur-sm shadow-lg p-2 z-50 custom-select-scrollbar"
              >
                {GROUPS.map((g) => (
                  <div key={g.title} className="mb-2 last:mb-0">
                    <div className="text-[10px] tracking-wide text-white/50 px-1 mb-1">
                      {g.title}
                    </div>
                    <div className="flex flex-col">
                      {g.items.map((it) => {
                        const active = intervalKey === it.key;
                        return (
                          <button
                            key={it.key}
                            type="button"
                            disabled={!it.supported}
                            onClick={() => {
                              setIntervalKey(it.key);
                              setOpen(false);
                            }}
                            className={[
                              "text-left px-2 py-1 rounded text-xs text-white/80",
                              !it.supported
                                ? "opacity-40 cursor-not-allowed"
                                : active
                                ? "bg-white/10"
                                : "hover:bg-white/10",
                            ].join(" ")}
                            title={
                              !it.supported &&
                              (it.key.endsWith("s") || it.value.endsWith("S"))
                                ? "Dexscreener iframe doesn't support seconds"
                                : undefined
                            }
                          >
                            {it.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full iframe */}
      <div className="relative flex-1 overflow-hidden">
        <iframe
          key={src}
          src={src}
          title="Dexscreener Chart"
          style={{ width: "100%", height: "100%", border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Explorer Modal */}
      <ExplorerModal
        isOpen={isExplorerOpen}
        onClose={() => setIsExplorerOpen(false)}
        tokenAddress={tokenAddress}
        chainId={token?.chainId}
        tokenName={token?.name || token?.symbol}
      />
    </div>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Check,
  BarChart2,
  TrendingUp,
  LineChart,
  AlertCircle,
} from "lucide-react";
import type { TrendingToken } from "@/hooks/useTrendingTokens";

export type IndicatorType = "macd" | "rsi" | "cuphandle" | "all";

export interface TechnicalIndicatorProps {
  userId: string;
  token?: TrendingToken;
  tokenAddress: string;
  authenticated: boolean;
  isGeneratingReport: boolean;
  disabled?: boolean;

  // statuses from parent hook
  isGeneratingMACD: boolean;
  isGeneratingRSI: boolean;
  isGeneratingCupHandle: boolean;
  isGeneratingAll: boolean;
  hasMACD: boolean;
  hasRSI: boolean;
  hasCupHandle: boolean;
  hasAll: boolean;

  // pure triggers (parent performs the fetch)
  onGenerateMACD?: () => void;
  onGenerateRSI?: () => void;
  onGenerateCupHandle?: () => void;
  onGenerateAll?: () => void;
}

export default function TechnicalIndicators({
  tokenAddress,
  authenticated,
  isGeneratingReport,
  disabled = false,
  isGeneratingMACD,
  isGeneratingRSI,
  isGeneratingCupHandle,
  isGeneratingAll,
  hasMACD,
  hasRSI,
  hasCupHandle,
  hasAll,
  onGenerateMACD,
  onGenerateRSI,
  onGenerateCupHandle,
  onGenerateAll,
}: TechnicalIndicatorProps) {
  const { ready, login } = usePrivy();

  const handleSignIn = async () => {
    if (!ready) return;
    await login();
  };

  /* ----------------------- Per-button countdowns (inside button only) ----------------------- */
  const [macdCountdown, setMacdCountdown] = useState<number | null>(null);
  const [rsiCountdown, setRsiCountdown] = useState<number | null>(null);
  const [cupCountdown, setCupCountdown] = useState<number | null>(null);
  const [allCountdown, setAllCountdown] = useState<number | null>(null);

  const macdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rsiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const allTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = (
    current: number | null,
    setter: React.Dispatch<React.SetStateAction<number | null>>,
    ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>
  ) => {
    if (ref.current) return; // already running
    setter(current ?? 50);
    ref.current = setInterval(() => {
      setter((prev) => {
        if (prev === null) return 50;
        // When it reaches 1, loop back to 50 if still generating
        return prev <= 1 ? 50 : prev - 1;
      });
    }, 1000);
  };

  const stopCountdown = (
    setter: React.Dispatch<React.SetStateAction<number | null>>,
    ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>
  ) => {
    if (ref.current) {
      clearInterval(ref.current);
      ref.current = null;
    }
    setter(null);
  };

  // Wire to generating flags
  useEffect(() => {
    if (isGeneratingMACD) startCountdown(macdCountdown, setMacdCountdown, macdTimerRef);
    else stopCountdown(setMacdCountdown, macdTimerRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGeneratingMACD]);

  useEffect(() => {
    if (isGeneratingRSI) startCountdown(rsiCountdown, setRsiCountdown, rsiTimerRef);
    else stopCountdown(setRsiCountdown, rsiTimerRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGeneratingRSI]);

  useEffect(() => {
    if (isGeneratingCupHandle) startCountdown(cupCountdown, setCupCountdown, cupTimerRef);
    else stopCountdown(setCupCountdown, cupTimerRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGeneratingCupHandle]);

  useEffect(() => {
    if (isGeneratingAll) startCountdown(allCountdown, setAllCountdown, allTimerRef);
    else stopCountdown(setAllCountdown, allTimerRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGeneratingAll]);

  useEffect(() => {
    return () => {
      if (macdTimerRef.current) clearInterval(macdTimerRef.current);
      if (rsiTimerRef.current) clearInterval(rsiTimerRef.current);
      if (cupTimerRef.current) clearInterval(cupTimerRef.current);
      if (allTimerRef.current) clearInterval(allTimerRef.current);
    };
  }, []);

  /* ----------------------- Button renderer ----------------------- */
  const renderButton = (
    icon: React.ReactNode,
    label: string,
    description: string,
    onClick: (() => void) | undefined,
    isGenerating: boolean | undefined,
    hasGenerated: boolean | undefined,
    countdown: number | null
  ) => {
    const baseDisabled =
      !authenticated ||
      !ready ||
      isGeneratingReport ||
      disabled ||
      !tokenAddress ||
      tokenAddress === "";

    const isDisabled = isGenerating ? true : baseDisabled;

    return (
      <div className="relative group">
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black/90 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
          {disabled ? "Select a coin to enable analysis" : description}
        </div>

        {/* When analysis already exists and not generating → show green pill (unchanged) */}
        {!isGenerating && hasGenerated ? (
          <div className="flex items-center justify-center w-full p-2 rounded-md bg-[#00B050] border border-[#00B050]/50">
            <Check className="w-5 h-5 text-white mr-2" />
            <span className="text-white font-semibold text-sm">Generated!</span>
          </div>
        ) : (
          // Always render a button; if generating, it's disabled and shows countdown INSIDE
          <button
            type="button"
            onClick={!authenticated ? handleSignIn : onClick}
            disabled={isDisabled}
            className={`flex items-center justify-center w-full p-2 rounded-md transition-all duration-200 ${
              isDisabled
                ? "bg-gray-700/30 text-gray-300 cursor-not-allowed border border-gray-600/30"
                : "bg-[#FFC000] hover:bg-[#FFC000]/80 text-black border border-[#FFC000]/50 cursor-pointer"
            }`}
            title={
              isGenerating
                ? "Generating…"
                : !authenticated
                ? "Sign in to generate"
                : disabled
                ? "Select a coin to enable analysis"
                : description
            }
          >
            {icon}
            <span className="ml-2 font-semibold text-sm">
              {isGenerating
                ? `Generating… ${countdown ?? 50}s`
                : label}
            </span>
          </button>
        )}
      </div>
    );
  };

  /* ----------------------- Render ----------------------- */
  return (
    <div className="flex flex-col gap-3 p-3 bg-black/30 rounded-md">
      {disabled && (
        <div className="flex items-center justify-center p-2 mb-2 bg-black/20 rounded-md border border-white/10">
          <AlertCircle className="w-4 h-4 text-[#FFC000] mr-2" />
          <span className="text-white/70 text-sm">
            Select a coin from chart view to enable analysis
          </span>
        </div>
      )}

      {renderButton(
        <LineChart className="w-5 h-5" />,
        "MACD Lines",
        "Generate Moving Average Convergence Divergence analysis",
        onGenerateMACD,
        isGeneratingMACD,
        hasMACD,
        macdCountdown
      )}

      {renderButton(
        <TrendingUp className="w-5 h-5" />,
        "RSI Indicator",
        "Generate Relative Strength Index analysis",
        onGenerateRSI,
        isGeneratingRSI,
        hasRSI,
        rsiCountdown
      )}

      {renderButton(
        <BarChart2 className="w-5 h-5" />,
        "Cup & Handle",
        "Identify Cup & Handle chart patterns",
        onGenerateCupHandle,
        isGeneratingCupHandle,
        hasCupHandle,
        cupCountdown
      )}

      <div className="border-t border-white/10 my-1"></div>

      {renderButton(
        <span className="text-lg" />,
        "Generate All",
        "Generate all technical indicators at once",
        onGenerateAll,
        isGeneratingAll,
        hasAll,
        allCountdown
      )}

      <p className="text-white/60 text-xs mt-1 w-full text-center">
        AI-powered analysis using TradingView data
      </p>
    </div>
  );
}

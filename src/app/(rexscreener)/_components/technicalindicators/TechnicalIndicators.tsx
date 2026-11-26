"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Check,
  BarChart2,
  TrendingUp,
  LineChart,
  AlertCircle,
  Sparkles,
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
    countdown: number | null,
    variant: "secondary" | "primary" = "secondary"
  ) => {
    const baseDisabled =
      !authenticated ||
      !ready ||
      isGeneratingReport ||
      disabled ||
      !tokenAddress ||
      tokenAddress === "";

    const isDisabled = isGenerating ? true : baseDisabled;

    // When analysis already exists and not generating → "Generated!" state
    if (!isGenerating && hasGenerated) {
      return (
        <div className="ss-ind__done" role="status">
          <Check className="h-4 w-4" aria-hidden />
          <span>{label} · Generated!</span>
        </div>
      );
    }

    // Always render a button; if generating, it's disabled and shows countdown INSIDE
    return (
      <button
        type="button"
        onClick={!authenticated ? handleSignIn : onClick}
        disabled={isDisabled}
        className={`rx-btn rx-btn--${variant} ss-ind__btn${
          isGenerating ? " is-busy" : ""
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
        {isGenerating ? <span className="rx-spin" aria-hidden="true" /> : icon}
        <span>
          {isGenerating ? (
            <>
              Generating…{" "}
              <span className="rx-num">{countdown ?? 50}s</span>
            </>
          ) : (
            label
          )}
        </span>
      </button>
    );
  };

  /* ----------------------- Render ----------------------- */
  return (
    <div className="rx-well ss-ind">
      {disabled && (
        <div className="ss-ind__note">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <span>Select a coin from chart view to enable analysis</span>
        </div>
      )}

      <div className="ss-ind__grid">
        {renderButton(
          <LineChart className="h-4 w-4" aria-hidden />,
          "MACD Lines",
          "Generate Moving Average Convergence Divergence analysis",
          onGenerateMACD,
          isGeneratingMACD,
          hasMACD,
          macdCountdown
        )}

        {renderButton(
          <TrendingUp className="h-4 w-4" aria-hidden />,
          "RSI Indicator",
          "Generate Relative Strength Index analysis",
          onGenerateRSI,
          isGeneratingRSI,
          hasRSI,
          rsiCountdown
        )}

        {renderButton(
          <BarChart2 className="h-4 w-4" aria-hidden />,
          "Cup & Handle",
          "Identify Cup & Handle chart patterns",
          onGenerateCupHandle,
          isGeneratingCupHandle,
          hasCupHandle,
          cupCountdown
        )}
      </div>

      <div className="ss-ind__sep" aria-hidden="true" />

      {renderButton(
        <Sparkles className="h-4 w-4" aria-hidden />,
        "Generate All",
        "Generate all technical indicators at once",
        onGenerateAll,
        isGeneratingAll,
        hasAll,
        allCountdown,
        "primary"
      )}

      <p className="rx-help">AI-powered analysis using TradingView data</p>
    </div>
  );
}

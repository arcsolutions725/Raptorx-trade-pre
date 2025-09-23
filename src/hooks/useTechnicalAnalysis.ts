/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

/* ======================== Types ======================== */

export type IndicatorType = "macd" | "rsi" | "cuphandle" | "all";
export type TimeframeType = "1m" | "5m" | "15m" | "1h" | "4h" | "D" | "W";

export interface TechnicalAnalysisOptions {
  userId?: string;
  onAnalysisGenerated?: (analysis: TechnicalAnalysis) => void;
  onError?: (error: Error, indicatorType: IndicatorType) => void;
  cacheResults?: boolean;
}

export interface TechnicalAnalysisRequest {
  indicatorType: IndicatorType;
  tokenAddress: string;
  timeframe?: TimeframeType;
}

export interface ChartDataPoint {
  time: number;
  value: number;
}

export interface MACDData {
  macdLine: number[] | ChartDataPoint[];
  signalLine: number[] | ChartDataPoint[];
  histogram: number[] | ChartDataPoint[];
  crossovers: Array<{ type: "bullish" | "bearish"; position: number }>;
  settings: {
    fastLength: number;
    slowLength: number;
    signalSmoothing: number;
  };
}

export interface RSIData {
  values: number[] | ChartDataPoint[];
  overbought: number;
  oversold: number;
  currentValue: number;
  trend: "bullish" | "bearish" | "neutral";
  divergences: Array<{ type: "bullish" | "bearish"; position: number }>;
  settings: {
    length: number;
  };
}

export interface CupHandleData {
  pattern: {
    detected: boolean;
    confidence: number;
    cupStart: number;
    cupEnd: number;
    handleStart: number;
    handleEnd: number;
    targetPrice: number;
  };
  priceAction: {
    volume: string;
    consolidation: boolean;
  };
}

export interface TechnicalAnalysis {
  id?: string;
  indicatorType: IndicatorType;
  tokenAddress: string;
  timeframe: TimeframeType;
  chartData: {
    macd?: MACDData;
    rsi?: RSIData;
    cuphandle?: CupHandleData;
  };
  analysis: string;
  createdAt: string;
}

/* ======================== Cache ======================== */

interface AnalysisCache {
  [key: string]: TechnicalAnalysis;
}

function createCacheKey(
  indicatorType: IndicatorType,
  tokenAddress: string,
  timeframe: TimeframeType
): string {
  return `${indicatorType}:${tokenAddress}:${timeframe}`;
}

const analysisCache: AnalysisCache = {};

/* ======================== Hook ======================== */

export function useTechnicalAnalysis(options: TechnicalAnalysisOptions = {}) {
  const { userId, onAnalysisGenerated, onError, cacheResults = true } = options;
  const { authenticated } = usePrivy();

  // Loading states
  const [isGeneratingMACD, setIsGeneratingMACD] = useState(false);
  const [isGeneratingRSI, setIsGeneratingRSI] = useState(false);
  const [isGeneratingCupHandle, setIsGeneratingCupHandle] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // Error states
  const [macdError, setMacdError] = useState<Error | null>(null);
  const [rsiError, setRsiError] = useState<Error | null>(null);
  const [cupHandleError, setCupHandleError] = useState<Error | null>(null);
  const [allError, setAllError] = useState<Error | null>(null);

  // Results
  const [macdAnalysis, setMacdAnalysis] = useState<TechnicalAnalysis | null>(
    null
  );
  const [rsiAnalysis, setRsiAnalysis] = useState<TechnicalAnalysis | null>(
    null
  );
  const [cupHandleAnalysis, setCupHandleAnalysis] =
    useState<TechnicalAnalysis | null>(null);
  const [allAnalysis, setAllAnalysis] = useState<TechnicalAnalysis | null>(
    null
  );

  // Retries
  const [macdRetries, setMacdRetries] = useState(0);
  const [rsiRetries, setRsiRetries] = useState(0);
  const [cupHandleRetries, setCupHandleRetries] = useState(0);
  const [allRetries, setAllRetries] = useState(0);
  const MAX_RETRIES = 3;

  // Abort controllers
  const macdAbortController = useRef<AbortController | null>(null);
  const rsiAbortController = useRef<AbortController | null>(null);
  const cupHandleAbortController = useRef<AbortController | null>(null);
  const allAbortController = useRef<AbortController | null>(null);

  /* ---------- Helpers to map state by indicator ---------- */

  const getStateSetter = useCallback(
    (
      indicatorType: IndicatorType
    ): {
      setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
      setError: React.Dispatch<React.SetStateAction<Error | null>>;
      setAnalysis: React.Dispatch<
        React.SetStateAction<TechnicalAnalysis | null>
      >;
      setRetries: React.Dispatch<React.SetStateAction<number>>;
      abortController: React.MutableRefObject<AbortController | null>;
    } => {
      switch (indicatorType) {
        case "macd":
          return {
            setIsGenerating: setIsGeneratingMACD,
            setError: setMacdError,
            setAnalysis: setMacdAnalysis,
            setRetries: setMacdRetries,
            abortController: macdAbortController,
          };
        case "rsi":
          return {
            setIsGenerating: setIsGeneratingRSI,
            setError: setRsiError,
            setAnalysis: setRsiAnalysis,
            setRetries: setRsiRetries,
            abortController: rsiAbortController,
          };
        case "cuphandle":
          return {
            setIsGenerating: setIsGeneratingCupHandle,
            setError: setCupHandleError,
            setAnalysis: setCupHandleAnalysis,
            setRetries: setCupHandleRetries,
            abortController: cupHandleAbortController,
          };
        case "all":
          return {
            setIsGenerating: setIsGeneratingAll,
            setError: setAllError,
            setAnalysis: setAllAnalysis,
            setRetries: setAllRetries,
            abortController: allAbortController,
          };
      }
    },
    []
  );

  /* ---------- Core generator (single source of truth) ---------- */

  const generateAnalysis = useCallback(
    async (
      indicatorType: IndicatorType,
      tokenAddress: string,
      timeframe: TimeframeType = "15m",
      retry = false
    ): Promise<TechnicalAnalysis | null> => {
      if (!authenticated || !userId) {
        throw new Error("User must be authenticated");
      }

      const {
        setIsGenerating,
        setError,
        setAnalysis,
        setRetries,
        abortController,
      } = getStateSetter(indicatorType);

      // Cache hit
      if (cacheResults && !retry) {
        const cacheKey = createCacheKey(indicatorType, tokenAddress, timeframe);
        const cachedAnalysis = analysisCache[cacheKey];
        if (cachedAnalysis) {
          setAnalysis(cachedAnalysis);
          onAnalysisGenerated?.(cachedAnalysis);
          return cachedAnalysis;
        }
      }

      try {
        // Cancel any previous in-flight request for this indicator
        if (abortController.current) abortController.current.abort();
        abortController.current = new AbortController();
        const signal = abortController.current.signal;

        setError(null);
        setIsGenerating(true);

        const requestBody: TechnicalAnalysisRequest & { userId: string } = {
          indicatorType,
          tokenAddress,
          timeframe,
          userId,
        };

        const response = await fetch("/api/technical-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to generate ${indicatorType} analysis`
          );
        }

        // Stream handling: first chunk may contain JSON (chartData) in "data: {...}\n\n"
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let analysisText = "";
        let chartData: any = null;

        if (reader) {
          let firstChunk = true;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            if (firstChunk) {
              try {
                const jsonMatch = chunk.match(/^data: (.+)$/m);
                if (jsonMatch && jsonMatch[1]) {
                  const jsonData = JSON.parse(jsonMatch[1]);
                  chartData = jsonData.chartData;
                }
                const textStart = chunk.indexOf("\n\n") + 2;
                if (textStart > 1) {
                  analysisText += chunk.substring(textStart);
                } else {
                  analysisText += chunk;
                }
                firstChunk = false;
              } catch {
                // if parsing fails, treat entire chunk as text
                analysisText += chunk;
                firstChunk = false;
              }
            } else {
              analysisText += chunk;
            }
          }
        }

        const analysis: TechnicalAnalysis = {
          id: `${indicatorType}-${Date.now()}`,
          indicatorType,
          tokenAddress,
          timeframe,
          chartData: chartData || {},
          analysis: analysisText,
          createdAt: new Date().toISOString(),
        };

        setAnalysis(analysis);

        if (cacheResults) {
          analysisCache[
            createCacheKey(indicatorType, tokenAddress, timeframe)
          ] = analysis;
        }

        onAnalysisGenerated?.(analysis);
        return analysis;
      } catch (error: any) {
        if (error?.name === "AbortError") return null;
        const err = new Error(
          error?.message || `Failed to generate ${indicatorType} analysis`
        );
        const { setError, setRetries } = getStateSetter(indicatorType);
        setError(err);
        if (retry) setRetries((prev) => prev + 1);
        onError?.(err, indicatorType);
        throw err;
      } finally {
        const { setIsGenerating, abortController } =
          getStateSetter(indicatorType);
        setIsGenerating(false);
        // do not nullify abortController.current here; next call will overwrite/abort as needed
      }
    },
    [
      authenticated,
      userId,
      cacheResults,
      getStateSetter,
      onAnalysisGenerated,
      onError,
    ]
  );

  /* ---------- Public generators with retry ---------- */

  const generateMACD = useCallback(
    async (tokenAddress: string, timeframe: TimeframeType = "15m") => {
      console.log(tokenAddress, "zzz");
      try {
        return await generateAnalysis("macd", tokenAddress, timeframe);
      } catch (e) {
        if (macdRetries < MAX_RETRIES) {
          return generateAnalysis("macd", tokenAddress, timeframe, true);
        }
        throw e;
      }
    },
    [generateAnalysis, macdRetries]
  );

  const generateRSI = useCallback(
    async (tokenAddress: string, timeframe: TimeframeType = "15m") => {
      try {
        return await generateAnalysis("rsi", tokenAddress, timeframe);
      } catch (e) {
        if (rsiRetries < MAX_RETRIES) {
          return generateAnalysis("rsi", tokenAddress, timeframe, true);
        }
        throw e;
      }
    },
    [generateAnalysis, rsiRetries]
  );

  const generateCupHandle = useCallback(
    async (tokenAddress: string, timeframe: TimeframeType = "15m") => {
      try {
        return await generateAnalysis("cuphandle", tokenAddress, timeframe);
      } catch (e) {
        if (cupHandleRetries < MAX_RETRIES) {
          return generateAnalysis("cuphandle", tokenAddress, timeframe, true);
        }
        throw e;
      }
    },
    [generateAnalysis, cupHandleRetries]
  );

  const generateAllIndicators = useCallback(
    async (tokenAddress: string, timeframe: TimeframeType = "15m") => {
      try {
        return await generateAnalysis("all", tokenAddress, timeframe);
      } catch (e) {
        if (allRetries < MAX_RETRIES) {
          return generateAnalysis("all", tokenAddress, timeframe, true);
        }
        throw e;
      }
    },
    [generateAnalysis, allRetries]
  );

  /* ---------- Utilities ---------- */

  const clearAllStates = useCallback(() => {
    // Loading
    setIsGeneratingMACD(false);
    setIsGeneratingRSI(false);
    setIsGeneratingCupHandle(false);
    setIsGeneratingAll(false);

    // Errors
    setMacdError(null);
    setRsiError(null);
    setCupHandleError(null);
    setAllError(null);

    // Results
    setMacdAnalysis(null);
    setRsiAnalysis(null);
    setCupHandleAnalysis(null);
    setAllAnalysis(null);

    // Retries
    setMacdRetries(0);
    setRsiRetries(0);
    setCupHandleRetries(0);
    setAllRetries(0);

    // Abort in-flight
    if (macdAbortController.current) macdAbortController.current.abort();
    if (rsiAbortController.current) rsiAbortController.current.abort();
    if (cupHandleAbortController.current)
      cupHandleAbortController.current.abort();
    if (allAbortController.current) allAbortController.current.abort();

    // Reset refs
    macdAbortController.current = null;
    rsiAbortController.current = null;
    cupHandleAbortController.current = null;
    allAbortController.current = null;
  }, []);

  const clearIndicatorState = useCallback(
    (indicatorType: IndicatorType) => {
      const {
        setIsGenerating,
        setError,
        setAnalysis,
        setRetries,
        abortController,
      } = getStateSetter(indicatorType);

      setIsGenerating(false);
      setError(null);
      setAnalysis(null);
      setRetries(0);

      if (abortController.current) {
        abortController.current.abort();
        abortController.current = null;
      }
    },
    [getStateSetter]
  );

  const clearCache = useCallback(
    (
      indicatorType?: IndicatorType,
      tokenAddress?: string,
      timeframe?: TimeframeType
    ) => {
      if (indicatorType && tokenAddress && timeframe) {
        // Clear specific entry
        delete analysisCache[
          createCacheKey(indicatorType, tokenAddress, timeframe)
        ];
        return;
      }
      if (indicatorType && tokenAddress) {
        // Clear all timeframes for indicator+token
        Object.keys(analysisCache).forEach((key) => {
          if (key.startsWith(`${indicatorType}:${tokenAddress}:`)) {
            delete analysisCache[key];
          }
        });
        return;
      }
      if (indicatorType) {
        // Clear all tokens/timeframes for indicator
        Object.keys(analysisCache).forEach((key) => {
          if (key.startsWith(`${indicatorType}:`)) delete analysisCache[key];
        });
        return;
      }
      // Clear everything
      Object.keys(analysisCache).forEach((key) => delete analysisCache[key]);
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (macdAbortController.current) macdAbortController.current.abort();
      if (rsiAbortController.current) rsiAbortController.current.abort();
      if (cupHandleAbortController.current)
        cupHandleAbortController.current.abort();
      if (allAbortController.current) allAbortController.current.abort();
    };
  }, []);

  /* ---------- Return API ---------- */

  return {
    // Generators
    generateMACD,
    generateRSI,
    generateCupHandle,
    generateAllIndicators,

    // Loading states
    isGeneratingMACD,
    isGeneratingRSI,
    isGeneratingCupHandle,
    isGeneratingAll,
    isGenerating:
      isGeneratingMACD ||
      isGeneratingRSI ||
      isGeneratingCupHandle ||
      isGeneratingAll,

    // Error states
    macdError,
    rsiError,
    cupHandleError,
    allError,

    // Results
    macdAnalysis,
    rsiAnalysis,
    cupHandleAnalysis,
    allAnalysis,

    // Utilities
    clearAllStates,
    clearIndicatorState,
    clearCache,
  };
}

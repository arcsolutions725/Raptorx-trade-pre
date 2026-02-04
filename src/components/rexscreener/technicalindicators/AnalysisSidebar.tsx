/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import copy from "copy-to-clipboard";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  BarChart2,
  TrendingUp,
  LineChart,
  RefreshCw,
  Info,
  X,
} from "lucide-react";
import type {
  TechnicalAnalysis,
  IndicatorType,
} from "@/hooks/useTechnicalAnalysis";

interface AnalysisSidebarProps {
  macdAnalysis: TechnicalAnalysis | null;
  rsiAnalysis: TechnicalAnalysis | null;
  cupHandleAnalysis: TechnicalAnalysis | null;
  allAnalysis: TechnicalAnalysis | null;
  isGeneratingMACD: boolean;
  isGeneratingRSI: boolean;
  isGeneratingCupHandle: boolean;
  isGeneratingAll: boolean;
  macdError: Error | null;
  rsiError: Error | null;
  cupHandleError: Error | null;
  allError: Error | null;
  onRefreshMACD?: () => void;
  onRefreshRSI?: () => void;
  onRefreshCupHandle?: () => void;
  onRefreshAll?: () => void;
  onClose?: () => void;
  visible?: boolean;
}

interface ExpandState {
  macd: boolean;
  rsi: boolean;
  cuphandle: boolean;
}

const COPY_TIMEOUT = 1500;

export default function AnalysisSidebar({
  macdAnalysis,
  rsiAnalysis,
  cupHandleAnalysis,
  allAnalysis,
  isGeneratingMACD,
  isGeneratingRSI,
  isGeneratingCupHandle,
  isGeneratingAll,
  macdError,
  rsiError,
  cupHandleError,
  allError,
  onRefreshMACD,
  onRefreshRSI,
  onRefreshCupHandle,
  onRefreshAll,
  onClose,
  visible = true,
}: AnalysisSidebarProps) {
  // Expand/collapse state for sections
  const [expanded, setExpanded] = useState<ExpandState>({
    macd: true,
    rsi: true,
    cuphandle: true,
  });

  // Copy state
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const copyTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );

  // Tooltip state
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Determine if we have any analysis
  const hasAnyAnalysis =
    macdAnalysis || rsiAnalysis || cupHandleAnalysis || allAnalysis;

  // Determine if we're generating any analysis
  const isGeneratingAny =
    isGeneratingMACD ||
    isGeneratingRSI ||
    isGeneratingCupHandle ||
    isGeneratingAll;

  // Determine if we have any errors
  const hasAnyError = macdError || rsiError || cupHandleError || allError;

  // Toggle section expansion
  const toggleSection = useCallback((section: keyof ExpandState) => {
    setExpanded((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  // Copy analysis text
  const handleCopy = useCallback((id: string, text: string) => {
    // Clear any existing timeout
    if (copyTimeoutRef.current[id]) {
      clearTimeout(copyTimeoutRef.current[id]);
    }

    // Copy text and set copied state
    copy(text);
    setCopied((prev) => ({ ...prev, [id]: true }));

    // Set timeout to reset copied state
    copyTimeoutRef.current[id] = setTimeout(() => {
      setCopied((prev) => ({ ...prev, [id]: false }));
    }, COPY_TIMEOUT);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(copyTimeoutRef.current).forEach((timeout) => {
        clearTimeout(timeout);
      });
    };
  }, []);

  // Format relative time
  const formatRelativeTime = useCallback((isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  // Format analysis text
  const formatAnalysisText = useCallback((text: string) => {
    return text.split("\n").map((line, i) => {
      // Format headers
      if (line.startsWith("## ")) {
        return (
          <h2 key={i} className="text-lg font-bold text-white mt-4 mb-2">
            {line.substring(3)}
          </h2>
        );
      }

      if (line.startsWith("### ")) {
        return (
          <h3 key={i} className="text-md font-semibold text-white mt-3 mb-1">
            {line.substring(4)}
          </h3>
        );
      }

      // Format bullet points
      if (line.startsWith("- ")) {
        return (
          <div key={i} className="ml-4 text-white/90 mb-1">
            • {line.substring(2)}
          </div>
        );
      }

      // Format empty lines
      if (!line.trim()) {
        return <div key={i} className="h-2" />;
      }

      // Format regular text with special handling for bullish/bearish terms
      const formattedLine = line
        .replace(/bullish/gi, '<span class="text-[#00B050]">bullish</span>')
        .replace(/bearish/gi, '<span class="text-[#FF4136]">bearish</span>')
        .replace(/neutral/gi, '<span class="text-[#FFC000]">neutral</span>')
        .replace(
          /resistance/gi,
          '<span class="text-[#FF4136] font-semibold">resistance</span>'
        )
        .replace(
          /support/gi,
          '<span class="text-[#00B050] font-semibold">support</span>'
        )
        .replace(
          /overbought/gi,
          '<span class="text-[#FF4136]">overbought</span>'
        )
        .replace(/oversold/gi, '<span class="text-[#00B050]">oversold</span>');

      return (
        <p
          key={i}
          className="text-white/90 mb-2 text-sm"
          dangerouslySetInnerHTML={{ __html: formattedLine }}
        />
      );
    });
  }, []);

  // Render indicator icon
  const renderIndicatorIcon = useCallback((type: IndicatorType) => {
    switch (type) {
      case "macd":
        return <LineChart className="w-5 h-5 text-[#FFC000]" />;
      case "rsi":
        return <TrendingUp className="w-5 h-5 text-[#FFC000]" />;
      case "cuphandle":
        return <BarChart2 className="w-5 h-5 text-[#FFC000]" />;
      case "all":
        return (
          <div className="relative">
            <LineChart className="w-5 h-5 text-[#FFC000]" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#00B050] rounded-full flex items-center justify-center text-[8px] text-white font-bold">
              3
            </div>
          </div>
        );
      default:
        return <LineChart className="w-5 h-5 text-[#FFC000]" />;
    }
  }, []);

  // Render signal indicator
  const renderSignalIndicator = useCallback((signal: string) => {
    const lowerSignal = signal.toLowerCase();

    if (lowerSignal.includes("bullish") || lowerSignal.includes("buy")) {
      return (
        <div className="flex items-center gap-1 text-[#00B050] font-semibold">
          <div className="w-2 h-2 rounded-full bg-[#00B050]" />
          {signal}
        </div>
      );
    }

    if (lowerSignal.includes("bearish") || lowerSignal.includes("sell")) {
      return (
        <div className="flex items-center gap-1 text-[#FF4136] font-semibold">
          <div className="w-2 h-2 rounded-full bg-[#FF4136]" />
          {signal}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 text-[#FFC000] font-semibold">
        <div className="w-2 h-2 rounded-full bg-[#FFC000]" />
        {signal}
      </div>
    );
  }, []);

  // Render confidence score
  const renderConfidenceScore = useCallback((score: number) => {
    const normalizedScore = Math.min(Math.max(0, score), 10);

    let color = "#FFC000"; // Default yellow
    if (normalizedScore >= 7) color = "#00B050"; // Green
    if (normalizedScore <= 3) color = "#FF4136"; // Red

    return (
      <div className="flex items-center gap-2">
        <span className="text-white/70 text-xs">Confidence:</span>
        <div className="h-2 w-20 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${normalizedScore * 10}%`,
              backgroundColor: color,
            }}
          />
        </div>
        <span className="text-white text-xs font-semibold">
          {normalizedScore}/10
        </span>
      </div>
    );
  }, []);

  // Render technical term tooltip
  const renderTooltip = useCallback(
    (term: string, description: string) => {
      return (
        <span className="relative inline-block group">
          <span
            className="text-[#FFC000] border-b border-dotted border-[#FFC000] cursor-help"
            onMouseEnter={() => setActiveTooltip(term)}
            onMouseLeave={() => setActiveTooltip(null)}
          >
            {term}
          </span>
          {activeTooltip === term && (
            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-black/90 text-white text-xs rounded-md z-10">
              {description}
            </span>
          )}
        </span>
      );
    },
    [activeTooltip]
  );

  // Extract key metrics from analysis
  const extractKeyMetrics = useCallback(
    (analysis: TechnicalAnalysis) => {
      const { indicatorType, chartData } = analysis;

      // Helper to safely extract a numeric value from either a raw number or a
      // `ChartDataPoint` object. Returns `undefined` if value cannot be derived.
      const getNumericValue = (val: number | { value: number } | undefined) => {
        if (typeof val === "number") return val;
        if (val && typeof (val as any).value === "number")
          return (val as any).value;
        return undefined;
      };
      // Helper to format numeric values or fallback to 'N/A'
      const formatNum = (val: number | undefined, digits = 4) =>
        val !== undefined ? val.toFixed(digits) : "N/A";

      switch (indicatorType) {
        case "macd":
          if (!chartData.macd) return null;
          const macd = chartData.macd;
          // Safely resolve latest values
          const latestMacd = getNumericValue(
            macd.macdLine[macd.macdLine.length - 1]
          );
          const latestSignal = getNumericValue(
            macd.signalLine[macd.signalLine.length - 1]
          );
          const latestHist = getNumericValue(
            macd.histogram[macd.histogram.length - 1]
          );
          return (
            <div className="grid grid-cols-2 gap-2 mt-2 mb-4 bg-black/20 p-2 rounded-md">
              <div className="text-xs text-white/70">MACD Line:</div>
              <div className="text-xs text-white font-mono">
                {formatNum(latestMacd)}
              </div>

              <div className="text-xs text-white/70">Signal Line:</div>
              <div className="text-xs text-white font-mono">
                {formatNum(latestSignal)}
              </div>

              <div className="text-xs text-white/70">Histogram:</div>
              <div className="text-xs text-white font-mono">
                {formatNum(latestHist)}
              </div>

              <div className="text-xs text-white/70">Recent Crossover:</div>
              <div className="text-xs">
                {macd.crossovers && macd.crossovers.length > 0
                  ? renderSignalIndicator(macd.crossovers[0].type)
                  : "None"}
              </div>
            </div>
          );

        case "rsi":
          if (!chartData.rsi) return null;
          const rsi = chartData.rsi;
          return (
            <div className="grid grid-cols-2 gap-2 mt-2 mb-4 bg-black/20 p-2 rounded-md">
              <div className="text-xs text-white/70">Current RSI:</div>
              <div className="text-xs text-white font-mono">
                {rsi.currentValue.toFixed(2)}
              </div>

              <div className="text-xs text-white/70">Overbought Level:</div>
              <div className="text-xs text-white font-mono">
                {rsi.overbought}
              </div>

              <div className="text-xs text-white/70">Oversold Level:</div>
              <div className="text-xs text-white font-mono">{rsi.oversold}</div>

              <div className="text-xs text-white/70">Current Trend:</div>
              <div className="text-xs">{renderSignalIndicator(rsi.trend)}</div>
            </div>
          );

        case "cuphandle":
          if (!chartData.cuphandle) return null;
          const pattern = chartData.cuphandle.pattern;
          return (
            <div className="grid grid-cols-2 gap-2 mt-2 mb-4 bg-black/20 p-2 rounded-md">
              <div className="text-xs text-white/70">Pattern Detected:</div>
              <div className="text-xs text-white font-mono">
                {pattern.detected ? "Yes" : "No"}
              </div>

              <div className="text-xs text-white/70">Confidence:</div>
              <div className="text-xs text-white font-mono">
                {pattern.confidence.toFixed(2)}%
              </div>

              {pattern.detected && (
                <>
                  <div className="text-xs text-white/70">Target Price:</div>
                  <div className="text-xs text-white font-mono">
                    ${pattern.targetPrice.toFixed(6)}
                  </div>

                  <div className="text-xs text-white/70">Volume Trend:</div>
                  <div className="text-xs text-white font-mono">
                    {chartData.cuphandle.priceAction.volume}
                  </div>
                </>
              )}
            </div>
          );

        case "all":
          return (
            <div className="mt-2 mb-4">
              {chartData.macd && (
                <div className="mb-3 bg-black/20 p-2 rounded-md">
                  <div className="text-xs text-white font-semibold mb-1">
                    MACD Summary:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-xs text-white/70">Signal:</div>
                    <div className="text-xs">
                      {chartData.macd.crossovers &&
                      chartData.macd.crossovers.length > 0
                        ? renderSignalIndicator(
                            chartData.macd.crossovers[0].type
                          )
                        : "Neutral"}
                    </div>
                  </div>
                </div>
              )}

              {chartData.rsi && (
                <div className="mb-3 bg-black/20 p-2 rounded-md">
                  <div className="text-xs text-white font-semibold mb-1">
                    RSI Summary:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-xs text-white/70">Current RSI:</div>
                    <div className="text-xs text-white font-mono">
                      {chartData.rsi.currentValue.toFixed(2)}
                    </div>

                    <div className="text-xs text-white/70">Status:</div>
                    <div className="text-xs">
                      {chartData.rsi.currentValue > chartData.rsi.overbought
                        ? renderSignalIndicator("Overbought")
                        : chartData.rsi.currentValue < chartData.rsi.oversold
                        ? renderSignalIndicator("Oversold")
                        : renderSignalIndicator("Neutral")}
                    </div>
                  </div>
                </div>
              )}

              {chartData.cuphandle && chartData.cuphandle.pattern.detected && (
                <div className="bg-black/20 p-2 rounded-md">
                  <div className="text-xs text-white font-semibold mb-1">
                    Cup & Handle:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-xs text-white/70">Target:</div>
                    <div className="text-xs text-white font-mono">
                      ${chartData.cuphandle.pattern.targetPrice.toFixed(6)}
                    </div>

                    <div className="text-xs text-white/70">Confidence:</div>
                    <div className="text-xs text-white font-mono">
                      {chartData.cuphandle.pattern.confidence.toFixed(2)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          );

        default:
          return null;
      }
    },
    [renderSignalIndicator]
  );

  // Render analysis section
  const renderAnalysisSection = useCallback(
    (
      type: IndicatorType,
      analysis: TechnicalAnalysis | null,
      isGenerating: boolean,
      error: Error | null,
      onRefresh?: () => void
    ) => {
      const isExpanded = expanded[type as keyof ExpandState];
      const sectionId = `${type}-section`;

      // Determine title based on type
      const title =
        type === "macd"
          ? "MACD Analysis"
          : type === "rsi"
          ? "RSI Analysis"
          : type === "cuphandle"
          ? "Cup & Handle Analysis"
          : "Combined Analysis";

      // Determine if we should show this section
      const shouldShow = analysis || isGenerating || error;
      if (!shouldShow) return null;

      return (
        <div className="mb-4 border border-white/10 rounded-lg overflow-hidden">
          {/* Section Header */}
          <div
            className="flex items-center justify-between p-3 bg-black/30 cursor-pointer"
            onClick={() => toggleSection(type as keyof ExpandState)}
          >
            <div className="flex items-center gap-2">
              {renderIndicatorIcon(type)}
              <h3 className="text-white font-semibold">{title}</h3>
            </div>

            <div className="flex items-center gap-2">
              {analysis && !isGenerating && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(sectionId, analysis.analysis);
                  }}
                  className="p-1 rounded-md hover:bg-white/10 transition"
                  title="Copy analysis"
                >
                  {copied[sectionId] ? (
                    <Check className="w-4 h-4 text-[#00B050]" />
                  ) : (
                    <Copy className="w-4 h-4 text-white/70" />
                  )}
                </button>
              )}

              {analysis && !isGenerating && onRefresh && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh();
                  }}
                  className="p-1 rounded-md hover:bg-white/10 transition"
                  title="Refresh analysis"
                >
                  <RefreshCw className="w-4 h-4 text-white/70" />
                </button>
              )}

              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-white/70" />
              ) : (
                <ChevronDown className="w-5 h-5 text-white/70" />
              )}
            </div>
          </div>

          {/* Section Content */}
          {isExpanded && (
            <div className="p-3">
              {/* Timestamp */}
              {analysis && (
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-white/50">
                    {formatRelativeTime(analysis.createdAt)}
                  </div>
                  <div className="text-xs text-white/50">
                    {analysis.timeframe} timeframe
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isGenerating && (
                <div className="flex flex-col items-center justify-center py-6">
                  <div className="w-8 h-8 border-2 border-[#FFC000] border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-white/70 text-sm">
                    Generating analysis...
                  </p>
                </div>
              )}

              {/* Error State */}
              {error && !isGenerating && (
                <div className="bg-[#FF4136]/10 border border-[#FF4136]/30 rounded-md p-3 mb-3">
                  <p className="text-[#FF4136] text-sm font-semibold mb-1">
                    Error generating analysis
                  </p>
                  <p className="text-white/70 text-xs">{error.message}</p>
                  {onRefresh && (
                    <button
                      type="button"
                      onClick={onRefresh}
                      className="mt-2 px-3 py-1 bg-[#FF4136]/20 hover:bg-[#FF4136]/30 text-white text-xs rounded-md transition"
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}

              {/* Analysis Content */}
              {analysis && !isGenerating && (
                <>
                  {/* Key Metrics */}
                  {extractKeyMetrics(analysis)}

                  {/* Analysis Text */}
                  <div className="text-white/90">
                    {formatAnalysisText(analysis.analysis)}
                  </div>

                  {/* Technical Terms */}
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-1 mb-2">
                      <Info className="w-4 h-4 text-[#FFC000]" />
                      <span className="text-white/70 text-xs">
                        Technical Terms
                      </span>
                    </div>

                    <div className="text-xs text-white/60 space-y-1">
                      {type === "macd" && (
                        <>
                          {renderTooltip(
                            "MACD",
                            "Moving Average Convergence Divergence - A trend-following momentum indicator showing the relationship between two moving averages."
                          )}
                          <br />
                          {renderTooltip(
                            "Signal Line",
                            "A 9-day EMA of the MACD line that triggers buy or sell signals when crossed."
                          )}
                          <br />
                          {renderTooltip(
                            "Histogram",
                            "Visual representation of the difference between MACD and its signal line."
                          )}
                        </>
                      )}

                      {type === "rsi" && (
                        <>
                          {renderTooltip(
                            "RSI",
                            "Relative Strength Index - A momentum oscillator that measures the speed and change of price movements on a scale from 0 to 100."
                          )}
                          <br />
                          {renderTooltip(
                            "Overbought",
                            "When RSI is above 70, suggesting a potential reversal to the downside."
                          )}
                          <br />
                          {renderTooltip(
                            "Oversold",
                            "When RSI is below 30, suggesting a potential reversal to the upside."
                          )}
                        </>
                      )}

                      {type === "cuphandle" && (
                        <>
                          {renderTooltip(
                            "Cup & Handle",
                            "A bullish continuation pattern resembling a cup with a handle, indicating a potential upward breakout."
                          )}
                          <br />
                          {renderTooltip(
                            "Target Price",
                            "The projected price level after a successful cup and handle pattern breakout."
                          )}
                          <br />
                          {renderTooltip(
                            "Volume Confirmation",
                            "Increasing volume during the handle formation confirms pattern validity."
                          )}
                        </>
                      )}

                      {type === "all" && (
                        <>
                          {renderTooltip(
                            "Technical Analysis",
                            "Study of price action and volume using chart patterns and indicators to forecast future price movements."
                          )}
                          <br />
                          {renderTooltip(
                            "Confluence",
                            "When multiple indicators or signals point to the same conclusion, increasing reliability."
                          )}
                          <br />
                          {renderTooltip(
                            "Support/Resistance",
                            "Price levels where a currency tends to find buying support or selling pressure."
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      );
    },
    [
      expanded,
      copied,
      toggleSection,
      handleCopy,
      formatRelativeTime,
      formatAnalysisText,
      renderIndicatorIcon,
      extractKeyMetrics,
      renderTooltip,
    ]
  );

  // If not visible, return null
  if (!visible) return null;

  return (
    <div className="w-full md:w-96 h-full bg-black/80 border-l border-white/10 overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-black/90 border-b border-white/10">
        <h2 className="text-white font-semibold text-lg">Technical Analysis</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/10 transition"
            title="Close analysis panel"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Empty State */}
        {!hasAnyAnalysis && !isGeneratingAny && !hasAnyError && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            {/* Simple chart emoji icon for empty state */}
            <div className="text-6xl mb-4">📈</div>
            <p className="text-white/70 mb-2">No analysis generated yet</p>
            <p className="text-white/50 text-sm">
              Generate technical indicators from the chart view to see analysis
              here
            </p>
          </div>
        )}

        {/* Analysis Sections */}
        {renderAnalysisSection(
          "macd",
          macdAnalysis,
          isGeneratingMACD,
          macdError,
          onRefreshMACD
        )}
        {renderAnalysisSection(
          "rsi",
          rsiAnalysis,
          isGeneratingRSI,
          rsiError,
          onRefreshRSI
        )}
        {renderAnalysisSection(
          "cuphandle",
          cupHandleAnalysis,
          isGeneratingCupHandle,
          cupHandleError,
          onRefreshCupHandle
        )}
        {renderAnalysisSection(
          "all",
          allAnalysis,
          isGeneratingAll,
          allError,
          onRefreshAll
        )}

        {/* Disclaimer */}
        {hasAnyAnalysis && (
          <div className="mt-6 pt-3 border-t border-white/10 text-white/40 text-xs">
            <p className="mb-1">
              <strong>Disclaimer:</strong> This analysis is generated by AI and
              should not be considered as financial advice. Always do your own
              research before making investment decisions.
            </p>
            <p>
              Past performance is not indicative of future results. Trading
              cryptocurrencies involves substantial risk.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { SecurityAnalytics } from "@/lib/api/birdeyeSecurtiy";

interface BirdeyeSafetyAnalyticsProps {
  data: SecurityAnalytics;
}

function RiskScoreDisplay({ score, level }: { score: number; level: string }) {
  const riskScore = score;

  const getScoreColor = (riskScore: number) => {
    if (riskScore >= 70) return "text-red-400";
    if (riskScore >= 40) return "text-orange-400";
    if (riskScore >= 20) return "text-yellow-400";
    return "text-green-400";
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "critical":
        return "bg-gradient-to-r from-red-500 to-red-600";
      case "high":
        return "bg-gradient-to-r from-orange-500 to-orange-600";
      case "medium":
        return "bg-gradient-to-r from-yellow-500 to-yellow-600";
      case "low":
        return "bg-gradient-to-r from-green-500 to-green-600";
      default:
        return "bg-gradient-to-r from-gray-500 to-gray-600";
    }
  };

  const getProgressColor = (riskScore: number) => {
    if (riskScore >= 70) return "bg-gradient-to-r from-red-500 to-red-600";
    if (riskScore >= 40)
      return "bg-gradient-to-r from-orange-500 to-orange-600";
    if (riskScore >= 20)
      return "bg-gradient-to-r from-yellow-500 to-yellow-600";
    return "bg-gradient-to-r from-green-500 to-green-600";
  };

  const getProgressWidth = (score: number) => {
    return Math.min(100, Math.max(0, score));
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case "critical":
        return (
          <svg
            className="w-5 h-5 text-red-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "high":
        return (
          <svg
            className="w-5 h-5 text-orange-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "low":
        return (
          <svg
            className="w-5 h-5 text-green-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-5 h-5 text-yellow-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-white flex items-center gap-2">
          {getRiskIcon(level)}
          Risk Assessment
        </h4>
        <div
          className={`px-4 py-2 rounded-full text-xs font-semibold text-white shadow-lg ${getLevelColor(
            level
          )}`}
        >
          {level.toUpperCase()}
        </div>
      </div>

      <div className="bg-black/20 rounded-xl p-6 border border-white/10">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-300 font-medium">Risk Score</span>
            <span className={`text-3xl font-bold ${getScoreColor(riskScore)}`}>
              {riskScore}/100
            </span>
          </div>

          <div className="relative">
            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden shadow-inner">
              <div
                className={`h-full transition-all duration-1000 ease-out ${getProgressColor(
                  riskScore
                )} shadow-lg`}
                style={{ width: `${getProgressWidth(riskScore)}%` }}
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-full pointer-events-none" />
          </div>

          <div className="flex justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              Safe (0)
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              Critical (100)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiquidityPoolChart({ lpAnalysis }: { lpAnalysis: any }) {
  const { lockedPercentage, topHolderPercentage, contractControlledLP } =
    lpAnalysis;

  const getColorByPercentage = (percentage: number, reversed = false) => {
    if (reversed) {
      if (percentage >= 70)
        return "text-red-400 bg-red-500/20 border-red-500/30";
      if (percentage >= 40)
        return "text-orange-400 bg-orange-500/20 border-orange-500/30";
      return "text-green-400 bg-green-500/20 border-green-500/30";
    } else {
      if (percentage >= 70)
        return "text-green-400 bg-green-500/20 border-green-500/30";
      if (percentage >= 40)
        return "text-yellow-400 bg-yellow-500/20 border-yellow-500/30";
      return "text-red-400 bg-red-500/20 border-red-500/30";
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold text-white flex items-center gap-2">
        <svg
          className="w-5 h-5 text-blue-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
        </svg>
        Liquidity Pool Analysis
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Locked Percentage */}
        <div
          className={`p-4 rounded-lg border ${getColorByPercentage(
            lockedPercentage
          )}`}
        >
          <div className="text-sm font-medium mb-2">LP Locked</div>
          <div className="text-2xl font-bold mb-2">
            {lockedPercentage.toFixed(1)}%
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                lockedPercentage >= 70
                  ? "bg-green-500"
                  : lockedPercentage >= 40
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, lockedPercentage)}%` }}
            />
          </div>
        </div>

        {/* Top Holder */}
        <div
          className={`p-4 rounded-lg border ${getColorByPercentage(
            topHolderPercentage,
            true
          )}`}
        >
          <div className="text-sm font-medium mb-2">Top Holder</div>
          <div className="text-2xl font-bold mb-2">
            {topHolderPercentage.toFixed(1)}%
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                topHolderPercentage >= 70
                  ? "bg-red-500"
                  : topHolderPercentage >= 40
                  ? "bg-orange-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${Math.min(100, topHolderPercentage)}%` }}
            />
          </div>
        </div>

        {/* Contract Controlled */}
        <div
          className={`p-4 rounded-lg border ${getColorByPercentage(
            contractControlledLP,
            true
          )}`}
        >
          <div className="text-sm font-medium mb-2">Contract Controlled</div>
          <div className="text-2xl font-bold mb-2">
            {contractControlledLP.toFixed(1)}%
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                contractControlledLP >= 50
                  ? "bg-red-500"
                  : contractControlledLP >= 25
                  ? "bg-orange-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${Math.min(100, contractControlledLP)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TaxAnalysisChart({ tokenSecurity }: { tokenSecurity: any }) {
  const buyTax = parseFloat(tokenSecurity.buyTax || "0");
  const sellTax = parseFloat(tokenSecurity.sellTax || "0");
  const transferTax = parseFloat(tokenSecurity.transferTax || "0");

  const getTaxColor = (tax: number) => {
    if (tax === 0) return "text-green-400 bg-green-500/20 border-green-500/30";
    if (tax <= 5)
      return "text-yellow-400 bg-yellow-500/20 border-yellow-500/30";
    if (tax <= 10)
      return "text-orange-400 bg-orange-500/20 border-orange-500/30";
    return "text-red-400 bg-red-500/20 border-red-500/30";
  };

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold text-white flex items-center gap-2">
        <svg
          className="w-5 h-5 text-purple-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
            clipRule="evenodd"
          />
        </svg>
        Tax Analysis
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Buy Tax */}
        <div className={`p-4 rounded-lg border ${getTaxColor(buyTax)}`}>
          <div className="text-sm font-medium mb-2">Buy Tax</div>
          <div className="text-2xl font-bold mb-2">{buyTax}%</div>
          <div className="text-xs">
            {buyTax === 0
              ? "No tax"
              : buyTax <= 5
              ? "Low"
              : buyTax <= 10
              ? "Medium"
              : "High"}
          </div>
        </div>

        {/* Sell Tax */}
        <div className={`p-4 rounded-lg border ${getTaxColor(sellTax)}`}>
          <div className="text-sm font-medium mb-2">Sell Tax</div>
          <div className="text-2xl font-bold mb-2">{sellTax}%</div>
          <div className="text-xs">
            {sellTax === 0
              ? "No tax"
              : sellTax <= 5
              ? "Low"
              : sellTax <= 10
              ? "Medium"
              : "High"}
          </div>
        </div>

        {/* Transfer Tax */}
        <div className={`p-4 rounded-lg border ${getTaxColor(transferTax)}`}>
          <div className="text-sm font-medium mb-2">Transfer Tax</div>
          <div className="text-2xl font-bold mb-2">{transferTax}%</div>
          <div className="text-xs">
            {transferTax === 0
              ? "No tax"
              : transferTax <= 2
              ? "Low"
              : transferTax <= 5
              ? "Medium"
              : "High"}
          </div>
        </div>
      </div>
    </div>
  );
}

function WarningsList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold text-red-400 flex items-center gap-2">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        Security Warnings ({warnings.length})
      </h4>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {warnings.map((warning, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg animate-in slide-in-from-left duration-300"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
            <span className="text-red-300 text-sm">{warning}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafetyIndicatorsList({ indicators }: { indicators: string[] }) {
  if (!indicators.length) return null;

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold text-green-400 flex items-center gap-2">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        Safety Indicators ({indicators.length})
      </h4>

      <div className="space-y-2 max-h-64 overflow-y-auto custom-sidebar-scrollbar">
        {indicators.map((indicator, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg animate-in slide-in-from-right duration-300"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
            <span className="text-green-300 text-sm">{indicator}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TokenDetails({ tokenSecurity }: { tokenSecurity: any }) {
  const formatNumber = (value?: string | number) => {
    if (!value && value !== 0) return "N/A";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (!Number.isFinite(num)) return "N/A";

    // Format large numbers with appropriate suffixes
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(2)}B`;
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }

    return new Intl.NumberFormat().format(num);
  };

  const getBooleanDisplay = (value?: string) => {
    if (value === "1") return { text: "Yes", color: "text-red-400" };
    if (value === "0") return { text: "No", color: "text-green-400" };
    return { text: "Unknown", color: "text-gray-400" };
  };

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold text-white">Token Details</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-lg p-4 border border-gray-700">
            <div className="text-sm text-gray-400 mb-3 font-medium">
              Basic Information
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Name:</span>
                <span className="text-white font-medium">
                  {tokenSecurity.tokenName || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Symbol:</span>
                <span className="text-white font-medium">
                  {tokenSecurity.tokenSymbol || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Supply:</span>
                <span className="text-white">
                  {formatNumber(tokenSecurity.totalSupply)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Holder Count:</span>
                <span className="text-white">{tokenSecurity.holderCount}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-4 border border-gray-700">
            <div className="text-sm text-gray-400 mb-3 font-medium">
              Exchange Listings
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Listed on CEX:</span>
                <span
                  className={
                    getBooleanDisplay(tokenSecurity.isInCex?.listed).color
                  }
                >
                  {getBooleanDisplay(tokenSecurity.isInCex?.listed).text}
                </span>
              </div>
              {tokenSecurity.isInCex?.listed === "1" && (
                <div className="flex justify-between">
                  <span>CEX List:</span>
                  <span className="text-green-400">
                    {tokenSecurity.isInCex.cex_list?.join(", ") || "Unknown"}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Listed on DEX:</span>
                <span
                  className={getBooleanDisplay(tokenSecurity.isInDex).color}
                >
                  {getBooleanDisplay(tokenSecurity.isInDex).text}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Whitelisted:</span>
                <span
                  className={
                    getBooleanDisplay(tokenSecurity.isWhitelisted).color
                  }
                >
                  {getBooleanDisplay(tokenSecurity.isWhitelisted).text}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg p-4 border border-gray-700">
            <div className="text-sm text-gray-400 mb-3 font-medium">
              Security Features
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Is Honeypot:</span>
                <span
                  className={getBooleanDisplay(tokenSecurity.isHoneypot).color}
                >
                  {getBooleanDisplay(tokenSecurity.isHoneypot).text}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cannot Buy:</span>
                <span
                  className={getBooleanDisplay(tokenSecurity.cannotBuy).color}
                >
                  {getBooleanDisplay(tokenSecurity.cannotBuy).text}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cannot Sell All:</span>
                <span
                  className={
                    getBooleanDisplay(tokenSecurity.cannotSellAll).color
                  }
                >
                  {getBooleanDisplay(tokenSecurity.cannotSellAll).text}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Is Proxy:</span>
                <span
                  className={getBooleanDisplay(tokenSecurity.isProxy).color}
                >
                  {getBooleanDisplay(tokenSecurity.isProxy).text}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Is Open Source:</span>
                <span
                  className={
                    getBooleanDisplay(tokenSecurity.isOpenSource).color
                  }
                >
                  {getBooleanDisplay(tokenSecurity.isOpenSource).text}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-4 border border-gray-700">
            <div className="text-sm text-gray-400 mb-3 font-medium">
              Creator Information
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Creator Percentage:</span>
                <span className="text-white">
                  {parseFloat(tokenSecurity.creatorPercentage || "0").toFixed(
                    2
                  )}
                  %
                </span>
              </div>
              <div className="flex justify-between">
                <span>Creator Balance:</span>
                <span className="text-white">
                  {formatNumber(tokenSecurity.creatorBalance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Creator Address:</span>
                <span className="text-white text-xs font-mono">
                  {tokenSecurity.creatorAddress
                    ? `${tokenSecurity.creatorAddress.slice(
                        0,
                        6
                      )}...${tokenSecurity.creatorAddress.slice(-4)}`
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BirdeyeSafetyAnalyticsComponent({
  data,
}: BirdeyeSafetyAnalyticsProps) {
  // Check if we have metadata from the enhanced API call
  const metadata = (data as any).metadata;

  return (
    <div className="space-y-8 p-6 rounded-xl border border-white/10">
      {/* Metadata section if available */}
      {metadata && (
        <div className="border-b border-gray-700 pb-6">
          <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z"
                clipRule="evenodd"
              />
              <path d="M8 6h4v2H8V6zM8 10h4v2H8v-2z" />
            </svg>
            Token Metadata
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-black/20 rounded-lg p-4 border border-white/10">
              <div className="text-sm text-gray-400 mb-1">Token Name</div>
              <div className="text-white font-medium">
                {metadata.name || "N/A"}
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4 border border-white/10">
              <div className="text-sm text-gray-400 mb-1">Symbol</div>
              <div className="text-white font-medium">
                {metadata.symbol || "N/A"}
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4 border border-white/10">
              <div className="text-sm text-gray-400 mb-1">Decimals</div>
              <div className="text-white font-medium">
                {metadata.decimals || "N/A"}
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4 border border-white/10">
              <div className="text-sm text-gray-400 mb-1">Social Links</div>
              <div className="flex gap-2">
                {metadata.extensions?.website && (
                  <a
                    href={metadata.extensions.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    🌐
                  </a>
                )}
                {metadata.extensions?.twitter && (
                  <a
                    href={metadata.extensions.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    🐦
                  </a>
                )}
                {metadata.extensions?.telegram && (
                  <a
                    href={metadata.extensions.telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    📱
                  </a>
                )}
                {!metadata.extensions?.website &&
                  !metadata.extensions?.twitter &&
                  !metadata.extensions?.telegram && (
                    <span className="text-gray-400">None</span>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-gray-700 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-gradient-to-r from-red-500/10 to-red-600/10 p-4 rounded-lg border border-red-500/20">
            <div className="text-sm text-red-400 font-medium mb-1">
              Risk Score
            </div>
            <div className="text-2xl font-bold text-white">
              {data.riskScore}/100
            </div>
          </div>
          <div className="bg-gradient-to-r from-orange-500/10 to-orange-600/10 p-4 rounded-lg border border-orange-500/20">
            <div className="text-sm text-orange-400 font-medium mb-1">
              Warnings
            </div>
            <div className="text-2xl font-bold text-white">
              {data.warnings.length}
            </div>
          </div>
          <div className="bg-gradient-to-r from-green-500/10 to-green-600/10 p-4 rounded-lg border border-green-500/20">
            <div className="text-sm text-green-400 font-medium mb-1">
              Safety Features
            </div>
            <div className="text-2xl font-bold text-white">
              {data.safetyIndicators.length}
            </div>
          </div>
          <div className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 p-4 rounded-lg border border-blue-500/20">
            <div className="text-sm text-blue-400 font-medium mb-1">
              LP Holders
            </div>
            <div className="text-2xl font-bold text-white">
              {data.lpAnalysis.totalHolders}
            </div>
          </div>
        </div>
      </div>

      <RiskScoreDisplay score={data.riskScore} level={data.riskLevel} />

      <TaxAnalysisChart tokenSecurity={data.tokenSecurity} />

      <LiquidityPoolChart lpAnalysis={data.lpAnalysis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WarningsList warnings={data.warnings} />
        <SafetyIndicatorsList indicators={data.safetyIndicators} />
      </div>

      <TokenDetails tokenSecurity={data.tokenSecurity} />
    </div>
  );
}

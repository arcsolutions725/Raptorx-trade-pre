"use client";

import { HolderAnalytics } from "@/lib/api/bnbAnalytics";
import copy from "copy-to-clipboard";
import { useState } from "react";

interface HolderAnalyticsProps {
  data: HolderAnalytics;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(2) + "K";
  return num.toFixed(2);
}

// function formatPercentage(num: number): string {
//   if (num >= 1000000) return (num / 1000000).toFixed(1) + "M%";
//   if (num >= 1000) return (num / 1000).toFixed(1) + "K%";
//   return num.toFixed(1) + "%";
// }

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ProgressBar({
  percentage,
  color = "bg-gradient-to-r from-blue-500 to-blue-600",
  height = "h-3",
}: {
  percentage: number;
  color?: string;
  height?: string;
}) {
  return (
    <div
      className={`w-full ${height} bg-gray-700 rounded-full overflow-hidden`}
    >
      <div
        className={`${height} ${color} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
      />
    </div>
  );
}

function HolderDistributionChart({ data }: { data: HolderAnalytics }) {
  const { whaleHolders, mediumHolders, smallHolders } = data.holderDistribution;
  const total = whaleHolders + mediumHolders + smallHolders;

  if (total === 0) return null;

  const whalePercentage = (whaleHolders / total) * 100;
  const mediumPercentage = (mediumHolders / total) * 100;
  const smallPercentage = (smallHolders / total) * 100;

  return (
    <div className="bg-black/30 rounded-lg p-4 border border-white/10">
      <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
        🐋 Holder Distribution
      </h4>

      {/* Donut Chart Simulation with Stacked Bars */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-linear-to-r from-red-500 to-red-600 rounded"></div>
            <span className="text-white/90">Whales (&gt;1%)</span>
          </div>
          <span className="text-white font-mono">{whaleHolders}</span>
        </div>
        <ProgressBar
          percentage={whalePercentage}
          color="bg-gradient-to-r from-red-500 to-red-600"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-linear-to-r from-yellow-500 to-yellow-600 rounded"></div>
            <span className="text-white/90">Medium (0.1%-1%)</span>
          </div>
          <span className="text-white font-mono">{mediumHolders}</span>
        </div>
        <ProgressBar
          percentage={mediumPercentage}
          color="bg-gradient-to-r from-yellow-500 to-yellow-600"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-linear-to-r from-green-500 to-green-600 rounded"></div>
            <span className="text-white/90">Small (&lt;0.1%)</span>
          </div>
          <span className="text-white font-mono">{smallHolders}</span>
        </div>
        <ProgressBar
          percentage={smallPercentage}
          color="bg-gradient-to-r from-green-500 to-green-600"
        />
      </div>
    </div>
  );
}

function ConcentrationMetrics({ data }: { data: HolderAnalytics }) {
  const { top10Percentage, top50Percentage, top100Percentage } =
    data.concentration;

  return (
    <div className="bg-black/30 rounded-lg p-4 border border-white/10">
      <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
        📊 Token Concentration
      </h4>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-white/90">Top 10 Holders</span>
            <span className="text-white font-mono">
              {formatNumber(top10Percentage)}
            </span>
          </div>
          <ProgressBar
            percentage={top10Percentage}
            color="bg-gradient-to-r from-purple-500 to-purple-600"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-white/90">Top 50 Holders</span>
            <span className="text-white font-mono">
              {formatNumber(top50Percentage)}
            </span>
          </div>
          <ProgressBar
            percentage={top50Percentage}
            color="bg-gradient-to-r from-blue-500 to-blue-600"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-white/90">Top 100 Holders</span>
            <span className="text-white font-mono">
              {formatNumber(top100Percentage)}
            </span>
          </div>
          <ProgressBar
            percentage={top100Percentage}
            color="bg-gradient-to-r from-cyan-500 to-cyan-600"
          />
        </div>
      </div>

      {/* Risk Assessment */}
      <div className="mt-4 p-3 rounded-lg bg-black/40 border border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-white/70">
            Concentration Risk:
          </span>
          <span
            className={`text-sm font-semibold ${
              top10Percentage > 50
                ? "text-red-400"
                : top10Percentage > 30
                ? "text-yellow-400"
                : "text-green-400"
            }`}
          >
            {top10Percentage > 50
              ? "High"
              : top10Percentage > 30
              ? "Medium"
              : "Low"}
          </span>
        </div>
        <p className="text-xs text-white/60">
          {top10Percentage > 50
            ? "High concentration in top holders increases manipulation risk"
            : top10Percentage > 30
            ? "Moderate concentration suggests some centralization"
            : "Good distribution reduces concentration risk"}
        </p>
      </div>
    </div>
  );
}

function TopHoldersTable({ data }: { data: HolderAnalytics }) {
  const topHolders = data.topHolders.slice(0, 10);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopyAddress = (address: string) => {
    copy(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <div className="bg-black/30 rounded-lg p-4 border border-white/10">
      <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
        🏆 Top Holders
      </h4>

      <div className="space-y-2">
        {topHolders.map((holder, index) => {
          const quantity = parseFloat(holder.TokenHolderQuantity);
          return (
            <div
              key={holder.TokenHolderAddress}
              className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0
                      ? "bg-linear-to-r from-yellow-500 to-yellow-600"
                      : index === 1
                      ? "bg-linear-to-r from-gray-400 to-gray-500"
                      : index === 2
                      ? "bg-linear-to-r from-orange-500 to-orange-600"
                      : "bg-linear-to-r from-blue-500 to-blue-600"
                  }`}
                >
                  {index + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-sm">
                      {formatAddress(holder.TokenHolderAddress)}
                    </span>
                    <button
                      onClick={() =>
                        handleCopyAddress(holder.TokenHolderAddress)
                      }
                      className="text-white/40 hover:text-white/80 transition-colors p-1 rounded hover:bg-white/10"
                      title="Copy address"
                    >
                      {copiedAddress === holder.TokenHolderAddress ? (
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="text-white/60 text-xs">Rank #{index + 1}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-white font-mono text-sm">
                  {formatNumber(quantity)}
                </div>
                <div className="text-white/60 text-xs">tokens</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HolderAnalyticsComponent({ data }: HolderAnalyticsProps) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* <div className="bg-black/30 rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">
            {data.totalHolders}
          </div>
          <div className="text-white/70 text-sm">Total Holders</div>
        </div> */}

        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">
            {data.holderDistribution.whaleHolders}
          </div>
          <div className="text-white/70 text-sm">Whale Holders</div>
        </div>

        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">
            {formatNumber(data.concentration.top10Percentage)}
          </div>
          <div className="text-white/70 text-sm">Top 10 Concentration</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HolderDistributionChart data={data} />
        <ConcentrationMetrics data={data} />
      </div>

      <div className="mt-6">
        <TopHoldersTable data={data} />
      </div>
    </div>
  );
}

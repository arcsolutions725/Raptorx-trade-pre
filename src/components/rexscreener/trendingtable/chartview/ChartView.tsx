"use client";

import PriceChartWidget from "./PriceChartWidget";

type ChartViewProps = {
  tokenAddress: string;
  title?: string;
  onBack: () => void;
};

export default function ChartView({
  tokenAddress,
  title,
  onBack,
}: ChartViewProps) {
  return (
    <div className="flex flex-col w-full h-[calc(100vh-211px)] border border-white/10 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-black/50 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1 rounded border border-white/20 hover:bg-white/10"
          >
            ← Back
          </button>
          <div className="text-white/90 font-semibold">
            {title ?? "Price Chart"}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[400px]">
        <PriceChartWidget tokenAddress={tokenAddress} />
      </div>
    </div>
  );
}

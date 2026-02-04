"use client";

import { useState } from "react";
import Image from "next/image";
import { Share2 } from "lucide-react";
import copy from "copy-to-clipboard";
import { useParams } from "next/navigation";
import { formatPrice } from "@/utils/polymarketTrading";

type TradingHeaderProps = {
  marketTitle?: string | null;
  symbolImageUrl?: string;
  currentYesPrice: number;
  totalVolume?: number;
  onBack?: () => void;
  onGenerateClick?: () => void;
  isGenerating?: boolean;
  countdown?: number | null;
  hasGenerated?: boolean;
  ready?: boolean;
  canGenerate?: boolean;
};

export default function TradingHeader({
  marketTitle,
  symbolImageUrl,
  currentYesPrice,
  totalVolume,
  onBack,
  onGenerateClick,
  isGenerating,
  countdown,
  hasGenerated,
  ready,
  canGenerate,
}: TradingHeaderProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const params = useParams();

  const handleShareClick = () => {
    // Get event slug from URL params
    const eventSlug = params?.event as string | undefined;
    
    if (!eventSlug) {
      // Fallback to current page URL if no slug found
      const currentUrl = window.location.href;
      const copied = copy(currentUrl);
      if (copied) {
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 2000);
      }
      return;
    }

    // Construct event detail page URL
    const baseUrl = window.location.origin;
    const eventDetailUrl = `${baseUrl}/rexmarkets/polymarket/${encodeURIComponent(eventSlug)}`;
    
    const copied = copy(eventDetailUrl);
    if (copied) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 2000);
    }
  };

  return (
    <>
      {onBack && (
        <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            aria-label="Back to table"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Back to Markets</span>
          </button>
        </div>
      )}

      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {symbolImageUrl && (
              <Image
                src={symbolImageUrl}
                alt={marketTitle || "Market"}
                width={40}
                height={40}
                className="rounded flex-shrink-0"
                unoptimized
              />
            )}
            <div className="">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-lg font-bold text-[#ffc000] truncate">
                  {marketTitle}
                </h1>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-white/60">
                  C{formatPrice(currentYesPrice)}
                </span>
                <span className="text-sm text-red-400">
                  {currentYesPrice > 0
                    ? `-${((currentYesPrice - 0.75) * 100).toFixed(2)}%`
                    : "—"}
                </span>
                <span className="text-sm text-white/60">
                  Vol: {totalVolume?.toLocaleString() || "0"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {onGenerateClick && (
                <div className="flex-shrink-0">
                  {isGenerating && countdown !== null ? (
                    <div className="flex flex-col items-center justify-center py-1.5 px-3 rounded-lg bg-[#1a1a1a] border border-white/10">
                      <div className="text-[#FFD700] font-bold text-sm animate-pulse">
                        {countdown}s
                      </div>
                    </div>
                  ) : hasGenerated ? (
                    <div className="flex items-center justify-center py-1.5 px-3 rounded-lg bg-[#FFD700]">
                      <span className="text-black !font-bold text-xs">
                        Generated!
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onGenerateClick}
                      disabled={isGenerating || !ready || !canGenerate}
                      className={`py-1.5 px-3 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${
                        isGenerating || !ready || !canGenerate
                          ? "bg-[#ffc000]/30 cursor-not-allowed opacity-50 text-white/60"
                          : "bg-[#ffc000] hover:bg-[#ffd000] text-black shadow-lg shadow-[#ffc000]/20 hover:shadow-[#ffc000]/30 active:scale-[0.98]"
                      }`}
                      aria-label="Generate News Intelligence"
                    >
                      Generate News Intelligence Report
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={handleShareClick}
              className="flex items-center justify-center w-10 h-10 transition-all text-white/60 hover:text-[#ffc000] cursor-pointer"
              aria-label="Share market link"
            >
              <Share2 className="w-5 h-5" />
            </button>
            {showTooltip && (
              <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-black/90 border border-[#ffc000] text-[#ffc000] text-xs rounded-md whitespace-nowrap z-10">
                Link Copied
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

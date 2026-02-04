"use client";

import { useEffect, useRef } from "react";
import BuySellWidget from "../BuySellWidget/BuySellWidget";
import type { MarketOutcome } from "@/hooks/useMarketDetails";

type BuySellModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentYesPrice: number;
  currentNoPrice: number;
  onBuyClick: (outcome: "Yes" | "No") => void;
  onSellClick: (outcome: "Yes" | "No") => void;
  symbolImageUrl?: string;
  marketTitle?: string;
  availableMarkets?: Array<{
    condition_id?: string;
    ticker?: string;
    groupItemTitle?: string;
    subtitle?: string;
    clob_token_id?: string;
    clob_no_token_id?: string;
    yes_price?: number;
    no_price?: number;
  }>;
  marketsForOrderBook?: Array<{
    clobTokenId: string;
    clobNoTokenId: string | null;
    marketTitle: string;
    ticker?: string;
    conditionId: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
  }>;
  selectedMarketIndex?: number;
  onMarketIndexChange?: (index: number) => void;
  initialOutcome?: "Yes" | "No";
};

export default function BuySellModal({
  isOpen,
  onClose,
  currentYesPrice,
  currentNoPrice,
  onBuyClick,
  onSellClick,
  symbolImageUrl,
  marketTitle,
  availableMarkets = [],
  marketsForOrderBook = [],
  selectedMarketIndex = 0,
  onMarketIndexChange,
  initialOutcome,
}: BuySellModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle click outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black z-100 lg:hidden"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-[100] flex items-end justify-center lg:hidden pointer-events-none">
        <div
          ref={modalRef}
          className="w-full max-h-[95vh] bg-black border-t border-white/10 rounded-t-2xl shadow-2xl pointer-events-auto overflow-y-auto custom-sidebar-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Close Button */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-black z-10 backdrop-blur-sm">
            <h2 className="text-lg font-bold text-white">Place Order</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition text-gray-400 hover:text-white touch-manipulation"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* BuySellWidget Content */}
          <div className="p-4 pb-6">
            <BuySellWidget
              currentYesPrice={currentYesPrice}
              currentNoPrice={currentNoPrice}
              onBuyClick={(outcome) => {
                onBuyClick(outcome);
              }}
              onSellClick={(outcome) => {
                onSellClick(outcome);
              }}
              symbolImageUrl={symbolImageUrl}
              marketTitle={marketTitle}
              availableMarkets={availableMarkets}
              marketsForOrderBook={marketsForOrderBook}
              selectedMarketIndex={selectedMarketIndex}
              onMarketIndexChange={onMarketIndexChange}
              initialOutcome={initialOutcome}
            />
          </div>
        </div>
      </div>
    </>
  );
}


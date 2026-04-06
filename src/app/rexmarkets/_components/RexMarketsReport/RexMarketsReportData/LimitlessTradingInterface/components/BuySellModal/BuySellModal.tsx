"use client";

import { useEffect, useRef } from "react";
import BuySellWidget from "../BuySellWidget/BuySellWidget";
import type { LimitlessVenue } from "../BuySellWidget/BuySellWidget";

type BuySellModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentYesPrice: number;
  currentNoPrice: number;
  onBuyClick?: (outcome: "Yes" | "No") => void;
  onSellClick?: (outcome: "Yes" | "No") => void;
  symbolImageUrl?: string;
  marketTitle?: string;
  marketSlug?: string;
  venue?: LimitlessVenue | null;
  positionIds?: string[] | null;
  availableShares?: number;
  availableYesShares?: number;
  availableNoShares?: number;
  usdcBalance?: number;
  usdcBalanceFormatted?: string;
  nativeBalanceFormatted?: string;
  nativeLabel?: string;
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
  marketSlug,
  venue,
  positionIds,
  availableShares = 0,
  availableYesShares,
  availableNoShares,
  usdcBalance = 0,
  usdcBalanceFormatted = "0.00",
  nativeBalanceFormatted = "0",
  nativeLabel = "Base",
  initialOutcome,
}: BuySellModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
  }, [isOpen, onClose]);

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
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-100 lg:hidden"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-101 flex items-center justify-center p-4 lg:hidden pointer-events-none">
        <div
          ref={modalRef}
          className="relative w-full max-w-90 max-h-[90vh] bg-black border border-white/10 rounded-2xl shadow-2xl pointer-events-auto overflow-y-auto custom-sidebar-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="p-0">
            <BuySellWidget
              currentYesPrice={currentYesPrice}
              currentNoPrice={currentNoPrice}
              onBuyClick={onBuyClick}
              onSellClick={onSellClick}
              symbolImageUrl={symbolImageUrl}
              marketTitle={marketTitle}
              marketSlug={marketSlug}
              venue={venue}
              positionIds={positionIds}
              availableShares={availableShares}
              availableYesShares={availableYesShares}
              availableNoShares={availableNoShares}
              usdcBalance={usdcBalance}
              usdcBalanceFormatted={usdcBalanceFormatted}
              nativeBalanceFormatted={nativeBalanceFormatted}
              nativeLabel={nativeLabel}
              initialOutcome={initialOutcome}
            />
          </div>
        </div>
      </div>
    </>
  );
}

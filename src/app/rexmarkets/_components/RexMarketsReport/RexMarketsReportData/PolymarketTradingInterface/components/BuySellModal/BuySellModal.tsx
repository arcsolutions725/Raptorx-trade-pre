"use client";

import { useEffect, useRef } from "react";
import BuySellWidget from "../BuySellWidget/BuySellWidget";
import { IconClose } from "../../../shared/marketUi";
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
    <div className="mk-modal mk-modal--sheet">
      <div className="mk-modal__scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={modalRef}
        className="mk-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={marketTitle ? `Trade ${marketTitle}` : "Trade"}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="rx-icon-btn mk-modal__close"
          aria-label="Close modal"
        >
          <IconClose size={16} />
        </button>
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
  );
}

"use client";

import { useEffect, useRef } from "react";
import BuySellWidget from "../BuySellWidget/BuySellWidget";
import type { LimitlessVenue } from "../BuySellWidget/BuySellWidget";
import { IconClose } from "../../../shared/marketUi";

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
  );
}

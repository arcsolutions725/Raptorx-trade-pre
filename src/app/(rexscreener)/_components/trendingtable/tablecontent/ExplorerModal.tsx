"use client";

import { useEffect, useRef } from "react";
import { X, ArrowLeft, ExternalLink } from "lucide-react";

type ExplorerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tokenAddress: string;
  chainId?: string;
  tokenName?: string;
};

export default function ExplorerModal({
  isOpen,
  onClose,
  tokenAddress,
  chainId,
  tokenName,
}: ExplorerModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Determine which explorer to use
  const lowerChainId = chainId?.toLowerCase();
  const isBSC = lowerChainId === "bsc" || chainId === "56";
  const isBase = lowerChainId === "base" || chainId === "8453";
  const isMonad = lowerChainId === "monad" || chainId === "10143";
  const isEthereum = lowerChainId === "ethereum" || chainId === "1";
  const isRobinhood = lowerChainId === "robinhood" || chainId === "4663";

  const explorerUrl = isBase
    ? `https://basescan.org/token/${tokenAddress}`
    : isBSC
      ? `https://bscscan.com/token/${tokenAddress}`
      : isMonad
        ? `https://monadscan.com/address/${tokenAddress}`
        : isEthereum
          ? `https://etherscan.io/token/${tokenAddress}`
          : isRobinhood
            ? `https://robinhoodchain.blockscout.com/token/${tokenAddress}`
            : `https://solscan.io/token/${tokenAddress}`;

  const explorerName = isBase
    ? "BaseScan"
    : isBSC
      ? "BSCScan"
      : isMonad
        ? "MonadScan"
        : isEthereum
          ? "Etherscan"
          : isRobinhood
            ? "Robinhood Explorer"
            : "SolScan";

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[rgba(3,3,3,0.66)] backdrop-blur-[6px]"
        aria-hidden="true"
      />

      {/* Modal (RaptorX dialog: raised surface, foil top edge; a bottom sheet on phones) */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-explorer-title"
        className="rx-raised relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-b-none bg-[linear-gradient(180deg,var(--rx-pop-a),var(--rx-pop-b))] shadow-[var(--rx-depth-3)] sm:rounded-b-[var(--rx-r-l)]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-rx-line px-[18px] py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rx-btn rx-btn--ghost rx-btn--s -ml-1.5 shrink-0"
            title="Back to RaptorX"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to RaptorX
          </button>

          <div className="h-4 w-px shrink-0 bg-rx-line-strong" aria-hidden="true" />

          <div className="flex min-w-0 items-baseline gap-2">
            <div
              id="rx-explorer-title"
              className="shrink-0 font-display text-base font-bold text-rx-text [font-stretch:112%]"
            >
              {explorerName}
            </div>
            {tokenName && (
              <div className="truncate text-[13px] text-rx-text-3">
                {tokenName}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rx-icon-btn rx-icon-btn--s ml-auto shrink-0"
            aria-label="Close"
            title="Close"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col items-center gap-4 px-[18px] pb-[calc(22px+env(safe-area-inset-bottom,0px))] pt-6 text-center">
          <p className="m-0 max-w-[380px] text-sm leading-relaxed text-rx-text-2">
            Due to browser security restrictions, {explorerName} cannot be
            embedded directly.
          </p>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rx-btn rx-btn--primary"
          >
            Open on {explorerName}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <div className="rx-well flex w-full flex-col gap-1 px-3.5 py-2.5 text-left">
            <span className="rx-eyebrow">Token address</span>
            <span className="rx-num break-all text-[13px] text-rx-text">
              {tokenAddress}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

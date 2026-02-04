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
  const isBSC = chainId?.toLowerCase() === "bsc" || chainId === "56";
  const explorerUrl = isBSC
    ? `https://bscscan.com/token/${tokenAddress}`
    : `https://solscan.io/token/${tokenAddress}`;
  const explorerName = isBSC ? "BSCScan" : "SolScan";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-[95vw] h-[90vh] max-w-5xl bg-gray-900 rounded-lg border border-white/20 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-1.5 text-white hover:bg-white/10 rounded-md transition-colors"
              title="Back to RaptorX"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to RaptorX</span>
            </button>

            <div className="h-4 w-px bg-white/20" />

            <div className="flex items-center gap-2">
              <div className="text-white font-semibold">{explorerName}</div>
              {tokenName && (
                <div className="text-white/70 text-sm">- {tokenName}</div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-white/80 mb-4">
            Due to browser security restrictions, {explorerName} cannot be
            embedded directly.
          </p>
          <div className="flex items-center justify-center">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[#ffc000] font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open on {explorerName}
            </a>
          </div>
          <p className="text-white/60 text-sm mt-6 max-w-lg">
            Token Address:{" "}
            <span className="font-mono text-white">{tokenAddress}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

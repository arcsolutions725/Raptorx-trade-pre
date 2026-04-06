"use client";

import { X } from "lucide-react";
import { SwapWidget } from "@/components/swap/SwapWidget";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useEthereumWalletAddress } from "@/hooks/useEthereumWalletAddress";

function resolveForceChain(chainId?: string): "solana" | "bsc" | undefined {
  const c = String(chainId || "").toLowerCase();
  if (!c) return undefined;
  if (c.includes("bsc") || c.includes("bnb") || c === "56") return "bsc";
  if (c.includes("sol")) return "solana";
  return undefined;
}

export function CryptoSwapPanel({
  isOpen,
  onClose,
  currentUserId,
  payload,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  payload: any | null;
}) {
  const token = payload?.token ?? null;
  const tokenAddress: string | null =
    token?.tokenAddress || token?.contractAddress || null;
  const forceChain = resolveForceChain(token?.chainId);

  const { solanaAddress } = useSolanaWalletAddress();
  const { ethereumAddress } = useEthereumWalletAddress();
  const walletAddress =
    forceChain === "solana"
      ? solanaAddress
      : forceChain === "bsc"
        ? ethereumAddress
        : null;

  // Only mount SwapWidget when panel is open so it receives toTokenAddress on first mount (fixes empty "To" field)
  const content = (
    <div className="relative h-full min-h-0 bg-[#0b0b0b]">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-[1000] p-2 rounded-lg bg-black/70 border border-white/15 hover:bg-white/5 active:bg-white/10 transition-colors"
        aria-label="Close exchange panel"
        title="Close"
      >
        <X className="w-5 h-5 text-white/85" />
      </button>
      <div className="h-full">
        {isOpen ? (
          <SwapWidget
            key={`swap-${tokenAddress || "none"}`}
            currentUserId={currentUserId}
            toTokenAddress={tokenAddress}
            forceChain={forceChain}
            walletAddress={walletAddress}
          />
        ) : (
          <div className="h-full min-h-[200px]" />
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop panel */}
      <aside
        className={`hidden lg:flex flex-col h-full min-h-0 overflow-hidden bg-[#0b0b0b] transition-all duration-300 ease-in-out ${
          isOpen
            ? "w-[420px] border-l border-white/10 opacity-100"
            : "w-0 border-l-0 opacity-0 pointer-events-none"
        }`}
        aria-hidden={!isOpen}
      >
        <div
          className={`w-[420px] h-full transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {content}
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!isOpen}
      >
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity ${
            isOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={onClose}
        />
        <aside
          className={`absolute right-0 top-0 h-full w-[min(420px,100%)] border-l border-white/10 bg-[#0b0b0b] transform transition-transform ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {content}
        </aside>
      </div>
    </>
  );
}



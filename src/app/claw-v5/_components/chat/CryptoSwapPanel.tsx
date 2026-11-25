"use client";

import { ArrowLeftRight, X } from "lucide-react";
import clsx from "clsx";
import { SwapWidget } from "@/components/swap/SwapWidget";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useEthereumWalletAddress } from "@/hooks/useEthereumWalletAddress";
import { detectChain } from "@/utils/detectChain";
import type { SwapChain } from "@/lib/swapChain";

/**
 * Map a Claw cryptotech payload to the chain flag SwapWidget expects so LiFi gets
 * fromChain/fromToken (native) + toToken pre-filled for every chain we list.
 */
function resolveSwapChainFromPayload(payload: any | null): {
  forceChain: SwapChain | undefined;
} {
  if (!payload) return { forceChain: undefined };
  const token = payload?.token ?? null;
  const explicitRaw =
    token?.chainId ??
    token?.chain ??
    payload?.report?.chain ??
    payload?.metadata?.chain ??
    (payload?.report as { metadata?: { chain?: string } } | undefined)?.metadata
      ?.chain ??
    payload?.dexData?.chainId ??
    payload?.dexData?.chain;

  if (explicitRaw != null && String(explicitRaw).trim() !== "") {
    const normalized = detectChain({ explicitChain: String(explicitRaw) });
    return { forceChain: normalized };
  }

  const addr = String(
    token?.tokenAddress ||
      token?.contractAddress ||
      payload?.report?.contractAddress ||
      payload?.metadata?.contractAddress ||
      "",
  ).trim();
  if (addr.startsWith("0x") && addr.length === 42) {
    // EVM address without chain metadata — default to Ethereum mainnet.
    return { forceChain: "ethereum" };
  }
  if (addr.length >= 32) {
    return { forceChain: "solana" };
  }
  return { forceChain: undefined };
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
    token?.tokenAddress ||
    token?.contractAddress ||
    payload?.report?.contractAddress ||
    payload?.metadata?.contractAddress ||
    null;
  const { forceChain } = resolveSwapChainFromPayload(payload);

  const { solanaAddress } = useSolanaWalletAddress();
  const { ethereumAddress } = useEthereumWalletAddress();
  const walletAddress =
    forceChain === "solana"
      ? solanaAddress
      : forceChain === "bsc" ||
          forceChain === "ethereum" ||
          forceChain === "base" ||
          forceChain === "monad"
        ? ethereumAddress
        : null;

  const head = (
    <div className="panel__head">
      <span className="claw-mark" aria-hidden="true">
        <ArrowLeftRight className="size-3.5" />
      </span>
      <div className="panel__title">
        <b>Exchange</b>
        <span>Swap tokens instantly · powered by RaptorX</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rx-icon-btn panel-ctl"
        aria-label="Close exchange panel"
        title="Close"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );

  // Only mount SwapWidget when panel is open so it receives toTokenAddress on first mount (fixes empty "To" field)
  const content = (
    <div className="panel__body">
      <div className="h-full">
        {isOpen ? (
          <SwapWidget
            key={`swap-${forceChain ?? "auto"}-${tokenAddress || "none"}`}
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
      {/* Desktop: third column */}
      <aside
        className={clsx("claw-x hidden lg:block", isOpen && "is-open")}
        aria-label="Exchange"
        aria-hidden={!isOpen}
      >
        <div className="rx-raised claw-x__panel">
          {head}
          {content}
        </div>
      </aside>

      {/* Phones and tablets: bottom sheet */}
      <div
        className={clsx("claw-sheet lg:hidden", isOpen && "is-open")}
        aria-hidden={!isOpen}
      >
        <div className="claw-sheet__scrim" onClick={onClose} />
        <aside
          className="rx-raised claw-sheet__panel"
          aria-label="Exchange"
        >
          <span className="claw-sheet__grip" aria-hidden="true" />
          {head}
          {content}
        </aside>
      </div>
    </>
  );
}

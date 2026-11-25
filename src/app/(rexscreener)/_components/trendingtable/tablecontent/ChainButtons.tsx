"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import clsx from "clsx";

export type Chain =
  | "solana"
  | "robinhood"
  | "bsc"
  | "base"
  | "monad"
  | "ethereum"
  | "all";

interface ChainButtonsProps {
  selectedChain: Chain;
  onChainChange: (chain: Chain) => void;
  className?: string;
}

// Base, Robinhood, Ethereum, Solana, BNB, Monad — "all" remains a valid route but has no tab
const CHAINS: { id: Exclude<Chain, "all">; label: string; icon: string }[] = [
  { id: "base", label: "Base", icon: "/images/base.png" },
  { id: "robinhood", label: "Robinhood", icon: "/images/robinhood.png" },
  { id: "ethereum", label: "Ethereum", icon: "/images/ETH_light_logo.webp" },
  { id: "solana", label: "Solana", icon: "/images/solana.png" },
  { id: "bsc", label: "BNB Chain", icon: "/images/bnbchain.png" },
  { id: "monad", label: "Monad", icon: "/images/monad.png" },
];

/** RexScreener chain switcher: a segmented control (rx-seg) that scrolls sideways on phones. */
export function ChainButtons({
  selectedChain,
  onChainChange,
  className,
}: ChainButtonsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keep the active chain in view when the control scrolls (phones).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const active = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active) return;
    const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [selectedChain]);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Chain"
      className={clsx(
        "rx-seg max-w-full overflow-x-auto scrollbar-none",
        className,
      )}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {CHAINS.map((c) => {
        const active = selectedChain === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChainChange(c.id)}
            aria-pressed={active}
            title={c.label}
            className={clsx(
              "rx-seg__item shrink-0 whitespace-nowrap px-3",
              active && "is-active",
            )}
          >
            <Image
              src={c.icon}
              alt=""
              width={16}
              height={16}
              className="size-4 shrink-0 rounded-[4px] object-contain"
            />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

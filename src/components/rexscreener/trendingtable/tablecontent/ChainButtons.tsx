"use client";

import Image from "next/image";

export type Chain = "solana" | "bsc" | "all";

interface ChainButtonsProps {
  selectedChain: Chain;
  onChainChange: (chain: Chain) => void;
}

export function ChainButtons({
  selectedChain,
  onChainChange,
}: ChainButtonsProps) {
  const isActive = (chain: Chain) => selectedChain === chain;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChainChange("solana")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border-none transition ${
          isActive("solana")
            ? "border-[#14F195] bg-[#14F195]/10 ring-2 ring-[#14F195]/50"
            : "border-white/20 bg-black/30 hover:bg-white/10"
        }`}
        title="Solana"
      >
        <Image
          src="/images/btn_solana.png"
          alt="Solana"
          width={16}
          height={16}
          className="object-contain"
        />
        {/* <span className="text-sm text-white font-medium">Solana</span> */}
      </button>
      <div className="w-[1px] h-[22px] bg-white mx-1"></div>
      <button
        onClick={() => onChainChange("bsc")}
        className={`transition ${
          isActive("bsc")
            ? "opacity-100 ring-2 ring-[#F3BA2F] rounded-lg"
            : "opacity-60 hover:opacity-100"
        }`}
        title="BNB Chain"
      >
        <Image
          src="/images/bnb_btn.png"
          alt="BNB Chain"
          width={100}
          height={100}
          className="object-contain"
        />
      </button>
      <div className="w-[1px] h-[22px] border-white bg-white mx-1"></div>
      <button
        onClick={() => onChainChange("all")}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-md transition ${
          isActive("all")
            ? "border-[#ffc000] bg-purple-500/10 ring-2 ring-[#ffc000]"
            : "border-white/20 bg-black/30 hover:bg-white/10"
        }`}
        title="All Chains (Mixed)"
      >
        <span className="text-sm text-white font-medium">All</span>
      </button>
    </div>
  );
}

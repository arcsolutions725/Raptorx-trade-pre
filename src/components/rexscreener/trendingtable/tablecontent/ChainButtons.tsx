"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";

export type Chain = "solana" | "bsc" | "base" | "monad" | "all";

interface ChainButtonsProps {
  selectedChain: Chain;
  onChainChange: (chain: Chain) => void;
}

type SliderStyle = {
  left: number;
  width: number;
};

export function ChainButtons({
  selectedChain,
  onChainChange,
}: ChainButtonsProps) {
  const isActive = (chain: Chain) => selectedChain === chain;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sliderStyle, setSliderStyle] = useState<SliderStyle | null>(null);

  // Order: All, Monad, Base, Solana, BNB
  const chains: Chain[] = ["all", "monad", "base", "solana", "bsc"];
  const activeIndex = chains.indexOf(selectedChain);

  const updateSliderPosition = useCallback(() => {
    if (
      activeIndex < 0 ||
      !buttonRefs.current[activeIndex] ||
      !containerRef.current
    ) {
      setSliderStyle(null);
      return;
    }

    const activeButton = buttonRefs.current[activeIndex];
    const container = containerRef.current;
    const flexContainer = activeButton.parentElement;

    if (!flexContainer || !activeButton) {
      setSliderStyle(null);
      return;
    }

    try {
      const flexContainerRect = flexContainer.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const flexContainerLeft =
        flexContainerRect.left - containerRect.left + container.scrollLeft;

      const buttonLeft = activeButton.offsetLeft;
      const padding = 2;

      setSliderStyle({
        left: flexContainerLeft + buttonLeft + padding,
        width: activeButton.offsetWidth,
      });
    } catch (err) {
      console.warn("Failed to update slider position:", err);
      setSliderStyle(null);
    }
  }, [activeIndex]);

  useEffect(() => {
    buttonRefs.current = new Array(chains.length).fill(null);
  }, []);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      updateSliderPosition();
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeIndex, updateSliderPosition]);

  useEffect(() => {
    let rafId: number | null = null;

    const scheduleUpdate = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        updateSliderPosition();
      });
    };

    const handleResize = () => {
      scheduleUpdate();
    };

    window.addEventListener("resize", handleResize, { passive: true });

    const container = containerRef.current;
    if (container && typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserver.observe(container);

      return () => {
        window.removeEventListener("resize", handleResize);
        resizeObserver.disconnect();
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [updateSliderPosition]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center bg-white/12 p-0.5 overflow-x-auto scrollbar-none"
      style={{
        borderRadius: "12px",
        maxWidth: "100%",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Animated background slider */}
      {sliderStyle && (
        <div
          className="absolute top-0.5 bottom-0.5 bg-[#3C3C3C] shadow-md pointer-events-none"
          style={{
            left: `${sliderStyle.left}px`,
            width: `${sliderStyle.width}px`,
            height: "40px",
            borderRadius: "12px",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "left, width",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
          }}
        />
      )}

      {/* Chain Buttons Container */}
      <div className="relative flex items-center justify-start min-w-max gap-0">
        <button
          ref={(el) => {
            buttonRefs.current[0] = el;
          }}
          onClick={() => onChainChange("all")}
          className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center shrink-0 ${
            isActive("all")
              ? "text-white font-semibold"
              : "text-white hover:text-white/90"
          }`}
          style={{
            padding: "10px 14px",
            height: "40px",
            borderRadius: "12px",
          }}
          title="All Chains (Mixed)"
        >
          <span className="text-sm text-white font-medium">All</span>
        </button>
        {/* Monad */}
        <button
          ref={(el) => {
            buttonRefs.current[1] = el;
          }}
          onClick={() => onChainChange("monad")}
          className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 ${
            isActive("monad")
              ? "text-white font-semibold"
              : "text-white hover:text-white/90"
          }`}
          style={{
            padding: "10px 14px",
            height: "40px",
            borderRadius: "12px",
          }}
          title="Monad"
        >
          <Image
            src="/images/monad.png"
            alt="Monad"
            width={20}
            height={20}
            className="w-5 h-5 shrink-0 object-contain"
          />
          <span className="font-normal text-[14px]">Monad</span>
        </button>
        {/* Base */}
        <button
          ref={(el) => {
            buttonRefs.current[2] = el;
          }}
          onClick={() => onChainChange("base")}
          className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 ${
            isActive("base")
              ? "text-white font-semibold"
              : "text-white hover:text-white/90"
          }`}
          style={{
            padding: "10px 14px",
            height: "40px",
            borderRadius: "12px",
          }}
          title="Base"
        >
          <Image
            src="/images/base.png"
            alt="Base"
            width={20}
            height={20}
            className="w-5 h-5 shrink-0 object-contain"
          />
          <span className="font-normal text-[14px]">Base</span>
        </button>
        {/* Solana */}
        <button
          ref={(el) => {
            buttonRefs.current[3] = el;
          }}
          onClick={() => onChainChange("solana")}
          className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 ${
            isActive("solana")
              ? "text-white font-semibold"
              : "text-white hover:text-white/90"
          }`}
          style={{
            padding: "10px 14px",
            height: "40px",
            borderRadius: "12px",
          }}
          title="Solana"
        >
          <Image
            src="/images/solana.png"
            alt="Solana"
            width={20}
            height={20}
            className="w-5 h-5 shrink-0 object-contain"
          />
          <span className="font-normal text-[14px]">Solana</span>
        </button>
        {/* BNB */}
        <button
          ref={(el) => {
            buttonRefs.current[4] = el;
          }}
          onClick={() => onChainChange("bsc")}
          className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 ${
            isActive("bsc")
              ? "text-white font-semibold"
              : "text-white hover:text-white/90"
          }`}
          style={{
            padding: "10px 14px",
            height: "40px",
            borderRadius: "12px",
          }}
          title="BNB Chain"
        >
          <Image
            src="/images/bnbchain.png"
            alt="BNB Chain"
            width={20}
            height={20}
            className="w-5 h-5 shrink-0 object-contain"
          />
          <span className="font-normal text-[14px]">BNB Chain</span>
        </button>
      </div>
    </div>
  );
}

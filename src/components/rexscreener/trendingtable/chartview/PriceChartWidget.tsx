/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    createMyWidget?: (containerId: string, opts: any) => void;
    destroyMyWidget?: (containerId: string) => void;
  }
}

const SCRIPT_ID = "moralis-chart-widget";
const SCRIPT_SRC = "https://moralis.com/static/embed/chart.js";
const CONTAINER_ID = "price-chart-widget-container";

type PriceChartWidgetProps = {
  tokenAddress: string;
};

export default function PriceChartWidget({
  tokenAddress,
}: PriceChartWidgetProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const init = () => {
      if (typeof window.createMyWidget !== "function") {
        // If script loaded but API not present yet, try once more next tick
        setTimeout(init, 0);
        return;
      }

      // Clean previous instance (if lib supports it)
      try {
        window.destroyMyWidget?.(CONTAINER_ID);
      } catch {}

      // Create widget
      window.createMyWidget?.(CONTAINER_ID, {
        autoSize: true,
        chainId: "solana",
        pairAddress: tokenAddress,
        showHoldersChart: true,
        defaultInterval: "1D",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Etc/UTC",
        theme: "moralis",
        locale: "en",
        showCurrencyToggle: true,
        hideLeftToolbar: false,
        hideTopToolbar: false,
        hideBottomToolbar: false,
      });
    };

    const ensureScript = () => {
      const existing = document.getElementById(
        SCRIPT_ID
      ) as HTMLScriptElement | null;

      if (!existing) {
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.type = "text/javascript";
        script.async = true;
        script.onload = init;
        script.onerror = () => {
          console.error("Failed to load the chart widget script.");
        };
        document.body.appendChild(script);
      } else if (typeof window.createMyWidget === "function") {
        init();
      } else {
        // Script tag exists but not ready yet; hook onload
        existing.addEventListener("load", init, { once: true } as any);
      }
    };

    ensureScript();

    return () => {
      try {
        window.destroyMyWidget?.(CONTAINER_ID);
      } catch {}
    };
  }, [tokenAddress]);

  return (
    <div className="w-full h-full">
      <div id={CONTAINER_ID} className="w-full h-full" />
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  LiFiWidget,
  WidgetSkeleton,
  type WidgetConfig,
  useWidgetEvents,
  WidgetEvent,
  ChainId,
} from "@lifi/widget";
import type { Route } from "@lifi/sdk";
import type { RouteExecutionUpdate } from "@lifi/widget";
import { ClientOnly } from "./ClientOnly";
import { getHeliusRpcUrl } from "@/lib/rpc";
import { PhantomStandardWalletRegistrar } from "./solana-phantom-bridge/PhantomStandardWalletRegistrar";
import "@/styles/pages/swap.css";

/**
 * Appearance only: the RaptorX design-system look for the Li.Fi widget (the prototype's
 * swap card). Colours mirror the `--rx-*` tokens in raptorx-ds.css — the widget derives
 * shades from these in JS, so they have to be literal hex values, not CSS variables.
 * Everything the theme API can't reach (card titles as eyebrows, the flip button, the
 * header row, the wallet icon button) is styled in src/styles/pages/swap.css under `.rx-swap`.
 *
 * Module-level so the widget gets the same object every render (it memoises on it).
 */
const RX_SWAP_THEME: WidgetConfig["theme"] = {
  container: {
    // `height: fit-content` is load-bearing (the widget derives its max-height from it).
    height: "fit-content",
    boxShadow: "none",
    borderRadius: 0,
    border: "none",
    // Sit on the host panel's surface instead of painting a black box inside it.
    background: "transparent",
    // Fill the panel (the widget caps itself at 416px by default) but don't sprawl.
    maxWidth: 640,
    minWidth: 0,
  },
  palette: {
    mode: "dark",
    primary: { main: "#FFB800" }, // --rx-gold
    secondary: { main: "#FFD15C" }, // --rx-gold-hi ("Best" route label, selected rows)
    success: { main: "#45E3A3" }, // --rx-up
    error: { main: "#FF7A7A" }, // --rx-down
    warning: { main: "#FFB800" },
    background: {
      default: "#121211", // pages that need a solid ground (token list, sheets)
      paper: "#0D0D0C", // wells: rgba(0,0,0,.35) over the raised panel
    },
    text: { primary: "#F5F3F0", secondary: "#8A8988" }, // --rx-text / --rx-text-3
    grey: {
      200: "#B3B2B1",
      300: "#363534", // --rx-line-strong
      700: "#8A8988",
      800: "#262524", // --rx-line: card borders, avatar placeholders
    },
    divider: "#262524",
  },
  shape: {
    borderRadius: 12, // wells (--rx-r-m)
    borderRadiusSecondary: 13, // buttons (.rx-btn--l)
    borderRadiusTertiary: 10, // flip button
  },
  typography: {
    fontFamily: "var(--rx-ui)",
  },
  components: {
    MuiButton: {
      styleOverrides: {
        // Primary action = .rx-btn--primary.rx-btn--l
        contained: {
          minHeight: 48,
          fontSize: 15,
          fontWeight: 600,
          color: "#1A1206",
          background: "linear-gradient(180deg, #FFCB45 0%, #F2A900 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.45), 0 6px 18px rgba(255,184,0,.22)",
          "&:hover": {
            color: "#1A1206",
            background: "linear-gradient(180deg, #FFCB45 0%, #F2A900 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,.45), 0 6px 18px rgba(255,184,0,.22)",
            filter: "brightness(1.06)",
          },
          "&.Mui-disabled, &.Mui-disabled:hover": {
            background: "#1F1E1D",
            color: "#8A8988",
            boxShadow: "none",
            filter: "none",
          },
        },
      },
    },
  },
};

/** Prototype wording for the two labels the widget shares with the design. */
const RX_SWAP_LANGUAGE: WidgetConfig["languageResources"] = {
  en: { header: { exchange: "Swap", send: "You send" } },
};

interface SwapWidgetProps {
  currentUserId: string;
  toTokenAddress?: string | null;
  forceChain?: "solana" | "robinhood" | "bsc" | "ethereum" | "base" | "monad";
  walletAddress?: string | null;
}

type HandlerRefs = {
  currentUserId: string | undefined;
  toTokenAddress: string | null | undefined;
  resolvedChain:
    | "solana"
    | "robinhood"
    | "bsc"
    | "ethereum"
    | "base"
    | "monad"
    | undefined;
  walletAddress: string | null | undefined;
};

function resolveChain(
  forceChain: "solana" | "robinhood" | "bsc" | "ethereum" | "base" | "monad" | undefined,
  _toTokenAddress: string | null | undefined,
): "solana" | "robinhood" | "bsc" | "ethereum" | "base" | "monad" | undefined {
  // If a chain is explicitly forced (Solana, BSC, Base, Monad), respect it.
  // Otherwise, let the LiFi widget pick the appropriate chain based on the token.
  if (forceChain) return forceChain;
  return undefined;
}

export function SwapWidget({
  currentUserId,
  toTokenAddress,
  forceChain,
  walletAddress,
}: SwapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetEvents = useWidgetEvents();
  const processedSwapsRef = useRef<Set<string>>(new Set());
  const isProcessingRef = useRef(false);
  const processingRouteIdsRef = useRef<Set<string>>(new Set());
  const registeredWidgetEventsRef = useRef<typeof widgetEvents | null>(null);

  const resolvedChain = resolveChain(forceChain, toTokenAddress);
  const handlerRefsRef = useRef<HandlerRefs>({
    currentUserId,
    toTokenAddress,
    resolvedChain,
    walletAddress,
  });

  // LiFi docs: RouteExecutionUpdated provides the route with execution details (steps[].execution.process[].txHash).
  // RouteExecutionCompleted may receive the same or a minimal route; we use this ref to read txHash/amounts when needed.
  const lastRouteUpdateRef = useRef<Route | null>(null);

  // Update refs when props change
  useEffect(() => {
    handlerRefsRef.current = {
      currentUserId,
      toTokenAddress,
      resolvedChain,
      walletAddress,
    };
  }, [currentUserId, toTokenAddress, resolvedChain, walletAddress]);

  const baseWidgetConfig: Partial<WidgetConfig> = {
    appearance: "dark",
    variant: "compact",
    integrator: "huntonraptor",
    fee: 0.01,
    /**
     * 3%. Li.Fi ships no slippage of its own (`defaultSlippage = undefined`), so the
     * API falls back to ~0.5% — far too tight for the memecoins this terminal is
     * built around. The price moves more than that between the quote being built and
     * the transaction landing, the swap's minimum-output check trips, and the whole
     * transaction aborts. Phantom surfaces that as "Transaction simulation failed",
     * which reads like a wallet problem but is really the swap refusing to execute.
     *
     * This is the DEFAULT, not a cap: users can still change it in the widget's
     * settings. Higher slippage means more tolerance for adverse price movement, so
     * don't raise it further without cause.
     */
    slippage: 0.03,
    // buildUrl: true,
    hiddenUI: ["bridgesSettings", "appearance", "language", "poweredBy"],
    theme: RX_SWAP_THEME,
    languageResources: RX_SWAP_LANGUAGE,
    sdkConfig: {
      rpcUrls: {
        [ChainId.SOL]: [getHeliusRpcUrl()],
      },
    },
  };

  const handleSwapCompleted = useCallback(async (route: Route) => {
    const {
      currentUserId: userId,
      toTokenAddress: tokenAddr,
      resolvedChain: chain,
      walletAddress: wallet,
    } = handlerRefsRef.current;

    if (userId === undefined || userId === "") {
      return;
    }

    // Create a unique identifier for this swap transaction (without timestamp for deduplication)
    const routeId =
      (route as any).id ||
      `${userId}-${route.fromToken?.address || ""}-${route.toToken?.address || ""}-${route.fromAmount || ""}-${route.fromAmountUSD || ""}-${route.steps?.length || 0}`;

    // CRITICAL: Atomic check-and-set to prevent duplicate processing
    // Check if already processed
    if (processedSwapsRef.current.has(routeId)) {
      return;
    }

    // Check if currently processing this exact routeId
    if (processingRouteIdsRef.current.has(routeId)) {
      return;
    }

    // Mark this routeId as processing (atomic operation)
    processingRouteIdsRef.current.add(routeId);
    isProcessingRef.current = true;

    try {
      // Get from and to token addresses
      const fromAddress = route.fromToken?.address || "";
      const toAddress = route.toToken?.address || "";
      const fromToken =
        route.fromToken?.symbol ||
        route.fromToken?.address ||
        route.fromToken?.name ||
        "unknown";
      const toToken =
        route.toToken?.symbol ||
        route.toToken?.address ||
        route.toToken?.name ||
        "unknown";

      // Get amount in USD - use fromAmountUSD if available, otherwise calculate from fromAmount
      let amountUSDValue = 0;
      if (route.fromAmountUSD) {
        amountUSDValue = Number(route.fromAmountUSD);
      } else if (route.fromAmount && route.fromToken?.priceUSD) {
        amountUSDValue =
          Number(route.fromAmount) * Number(route.fromToken.priceUSD);
      } else if (route.fromAmount) {
        // Try to get price from route itself
        const routePriceUSD =
          (route as any).fromTokenPriceUSD || (route as any).priceUSD;
        if (routePriceUSD) {
          amountUSDValue = Number(route.fromAmount) * Number(routePriceUSD);
        }
      }

      // Validate required fields before making API call
      if (!fromAddress) {
        processingRouteIdsRef.current.delete(routeId);
        isProcessingRef.current = false;
        return;
      }

      if (!toAddress) {
        processingRouteIdsRef.current.delete(routeId);
        isProcessingRef.current = false;
        return;
      }

      if (!fromToken || fromToken === "unknown") {
        processingRouteIdsRef.current.delete(routeId);
        isProcessingRef.current = false;
        return;
      }

      if (!toToken || toToken === "unknown") {
        processingRouteIdsRef.current.delete(routeId);
        isProcessingRef.current = false;
        return;
      }

      if (amountUSDValue <= 0) {
        processingRouteIdsRef.current.delete(routeId);
        isProcessingRef.current = false;
        return;
      }

      // Determine if it's a buy based on the toToken matching the configured token
      const isBuy = tokenAddr
        ? toToken.toLowerCase() === tokenAddr.toLowerCase() ||
          route.toToken?.address?.toLowerCase() === tokenAddr.toLowerCase()
        : true; // Default to true if no specific token is targeted

      // Prefer route that was updated during execution (has steps[].execution.process[].txHash)
      const routeWithExecution = lastRouteUpdateRef.current ?? route;
      const steps = (routeWithExecution as any)?.steps as
        | Array<{
            action?: { fromAmount?: string };
            execution?: {
              process?: Array<{ txHash?: string }>;
              toAmount?: string;
            };
            estimate?: { toAmount?: string };
          }>
        | undefined;

      // 1) Wallet address: LiFi Route.fromAddress = wallet that sent the transfer (per SDK/docs)
      const routeFromAddress = (routeWithExecution as any)?.fromAddress as
        | string
        | undefined;
      const effectiveWalletAddress =
        typeof routeFromAddress === "string" && routeFromAddress.length > 0
          ? routeFromAddress
          : (wallet ?? undefined);

      // 2) Raw amounts: route.fromAmount / route.toAmount; fallback to first/last step
      let fromAmountRaw: string | undefined =
        routeWithExecution.fromAmount != null
          ? String(routeWithExecution.fromAmount)
          : undefined;
      let toAmountRaw: string | undefined =
        routeWithExecution.toAmount != null
          ? String(routeWithExecution.toAmount)
          : undefined;
      if (steps?.length) {
        if (fromAmountRaw == null && steps[0]?.action?.fromAmount != null) {
          fromAmountRaw = String(steps[0].action.fromAmount);
        }
        const lastStep = steps[steps.length - 1];
        if (toAmountRaw == null && lastStep?.execution?.toAmount != null) {
          toAmountRaw = String(lastStep.execution.toAmount);
        }
        if (toAmountRaw == null && lastStep?.estimate?.toAmount != null) {
          toAmountRaw = String(lastStep.estimate.toAmount);
        }
      }

      // 3) Transaction hash: from steps[].execution.process[].txHash (per LiFi "Monitor route execution")
      let txHash: string | undefined;
      if (steps?.length) {
        for (const step of steps) {
          const processes = step.execution?.process;
          if (processes?.length) {
            const withHash = processes.find((p) => p.txHash);
            if (withHash?.txHash) {
              txHash = withHash.txHash;
              break;
            }
          }
        }
      }

      const requestBody = {
        amountUSD: amountUSDValue,
        fromToken,
        toToken,
        fromAddress,
        toAddress,
        // Record the chain the swap actually happened on. This used to collapse
        // anything that wasn't bsc/ethereum/base to "solana", so Monad and Robinhood
        // swaps were logged against the wrong chain.
        chain: chain === "bsc" ? "bnb" : (chain ?? "solana"),
        isBuy,
        walletAddress: effectiveWalletAddress,
        fromAmountRaw: fromAmountRaw ?? undefined,
        toAmountRaw: toAmountRaw ?? undefined,
        txHash: txHash ?? undefined,
      };

      const response = await fetch("/api/swaps/points", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        await response.json().catch(() => ({ error: "Unknown error" }));
        // On API error, mark as processed to prevent immediate retry (backend should handle duplicates)
        processedSwapsRef.current.add(routeId);
      } else {
        await response.json().catch(() => ({}));
        // Mark as successfully processed
        processedSwapsRef.current.add(routeId);
      }
    } catch (err) {
      // On exception, don't mark as processed so it can be retried
      // Don't add to processedSwapsRef
    } finally {
      // Always remove from processing set and reset flag
      processingRouteIdsRef.current.delete(routeId);
      isProcessingRef.current = processingRouteIdsRef.current.size > 0;
    }
  }, []); // Empty deps - function never changes, reads from refs

  useEffect(() => {
    if (!widgetEvents) {
      return;
    }

    // Prevent duplicate listener registration for the same widgetEvents instance
    if (registeredWidgetEventsRef.current === widgetEvents) {
      return;
    }

    const handleRouteUpdated = (update: RouteExecutionUpdate) => {
      if (update?.route) lastRouteUpdateRef.current = update.route;
    };
    const handleRouteStarted = () => {
      lastRouteUpdateRef.current = null;
    };

    try {
      widgetEvents.on(WidgetEvent.RouteExecutionStarted, handleRouteStarted);
      widgetEvents.on(WidgetEvent.RouteExecutionUpdated, handleRouteUpdated);
      widgetEvents.on(WidgetEvent.RouteExecutionCompleted, handleSwapCompleted);
      registeredWidgetEventsRef.current = widgetEvents;
    } catch (err) {
      // Fallback: try string-based event name
      try {
        widgetEvents.on("routeExecutionCompleted" as any, handleSwapCompleted);
        registeredWidgetEventsRef.current = widgetEvents;
      } catch (fallbackErr) {
        // Silent fallback failure
      }
    }

    // Use widgetEvents.all.clear() for cleanup as per official LiFi documentation
    return () => {
      lastRouteUpdateRef.current = null;
      if (widgetEvents?.all?.clear) {
        widgetEvents.all.clear();
      } else {
        try {
          widgetEvents.off(
            WidgetEvent.RouteExecutionStarted,
            handleRouteStarted,
          );
          widgetEvents.off(
            WidgetEvent.RouteExecutionUpdated,
            handleRouteUpdated,
          );
          widgetEvents.off(
            WidgetEvent.RouteExecutionCompleted,
            handleSwapCompleted,
          );
        } catch (err) {
          try {
            widgetEvents.off(
              "routeExecutionStarted" as any,
              handleRouteStarted,
            );
            widgetEvents.off(
              "routeExecutionUpdated" as any,
              handleRouteUpdated,
            );
            widgetEvents.off(
              "routeExecutionCompleted" as any,
              handleSwapCompleted,
            );
          } catch (e) {
            // Silent cleanup failure
          }
        }
      }
      registeredWidgetEventsRef.current = null;
    };
  }, [widgetEvents, handleSwapCompleted]);

  return (
    <div ref={containerRef} className="rx-swap">
      {/* Registers Wallet Standard "Phantom" when the extension isn't injected
          (mobile / no extension) so Li.Fi lists it like MetaMask on EVM. */}
      <PhantomStandardWalletRegistrar />
      <div className="rx-swap__scroll">
        {/* Explicit BSC configuration */}
        {resolvedChain === "bsc" && (
          <div className="w-full p-0">
            <ClientOnly
              fallback={
                <div className="rx-swap__fallback">
                  <WidgetSkeleton
                    config={{
                      ...baseWidgetConfig,
                      toToken: toTokenAddress ? toTokenAddress : undefined,
                    }}
                  />
                </div>
              }
            >
              <LiFiWidget
                key={`lifi-bsc-${toTokenAddress || "none"}`}
                integrator="huntonraptor"
                fee={0.01}
                config={{
                  ...baseWidgetConfig,
                  fromChain: 56,
                  fromToken: "0x0000000000000000000000000000000000000000",
                  toChain: 56,
                  toToken: toTokenAddress ? toTokenAddress : undefined,
                }}
              />
            </ClientOnly>
          </div>
        )}

        {/* Explicit Ethereum configuration */}
        {resolvedChain === "ethereum" && (
          <div className="w-full p-0">
            <ClientOnly
              fallback={
                <div className="rx-swap__fallback">
                  <WidgetSkeleton
                    config={{
                      ...baseWidgetConfig,
                      toToken: toTokenAddress ? toTokenAddress : undefined,
                    }}
                  />
                </div>
              }
            >
              <LiFiWidget
                key={`lifi-ethereum-${toTokenAddress || "none"}`}
                integrator="huntonraptor"
                fee={0.01}
                config={{
                  ...baseWidgetConfig,
                  fromChain: 1,
                  fromToken: "0x0000000000000000000000000000000000000000",
                  toChain: 1,
                  toToken: toTokenAddress ? toTokenAddress : undefined,
                }}
              />
            </ClientOnly>
          </div>
        )}

        {/* Explicit Base configuration */}
        {resolvedChain === "base" && (
          <div className="w-full p-0">
            <ClientOnly
              fallback={
                <div className="rx-swap__fallback">
                  <WidgetSkeleton
                    config={{
                      ...baseWidgetConfig,
                      toToken: toTokenAddress ? toTokenAddress : undefined,
                    }}
                  />
                </div>
              }
            >
              <LiFiWidget
                key={`lifi-base-${toTokenAddress || "none"}`}
                integrator="huntonraptor"
                fee={0.01}
                config={{
                  ...baseWidgetConfig,
                  fromChain: 8453,
                  fromToken: "0x0000000000000000000000000000000000000000",
                  toChain: 8453,
                  toToken: toTokenAddress ? toTokenAddress : undefined,
                }}
              />
            </ClientOnly>
          </div>
        )}

        {/* Explicit Solana configuration — same pattern as EVM chains:
            Li.Fi owns wallet connect/sign (Phantom via Wallet Standard / MWA). */}
        {resolvedChain === "solana" && (
          <div className="h-full w-full p-0">
            <ClientOnly
              fallback={
                <div className="rx-swap__fallback">
                  <WidgetSkeleton
                    config={{
                      ...baseWidgetConfig,
                      toToken: toTokenAddress ? toTokenAddress : undefined,
                    }}
                  />
                </div>
              }
            >
              <LiFiWidget
                key={`lifi-sol-${toTokenAddress || "none"}`}
                integrator="huntonraptor"
                fee={0.01}
                config={{
                  ...baseWidgetConfig,
                  fromChain: 1151111081099710,
                  fromToken: "11111111111111111111111111111111",
                  toChain: 1151111081099710,
                  toToken: toTokenAddress || undefined,
                  /**
                   * Pin the DESTINATION to Solana.
                   *
                   * `toChain` above is only an initial default, and the widget persists
                   * the user's last pick in localStorage — so one stray tap leaves the
                   * destination stuck on Taiko/Lisk/Bitcoin, on a Solana token page,
                   * across every later visit. The result is a dead widget: Li.Fi can't
                   * route $1 of SOL to an obscure L2, so it reports "No routes
                   * available" and the Exchange button has nothing to submit. Worse, a
                   * connected Phantom (Solana) wallet can't sign for an EVM source
                   * chain, so the button reverts to "Connect wallet" while the wallet
                   * is plainly connected.
                   *
                   * Source is deliberately left open: paying for a Solana token with
                   * ETH/USDC from another chain is a legitimate flow. It's swapping OUT
                   * to a random chain that never makes sense here.
                   */
                  chains: { to: { allow: [ChainId.SOL] } },
                }}
              />
            </ClientOnly>
          </div>
        )}

        {/* Explicit Monad configuration: use Monad chain (10143) and MON native token */}
        {resolvedChain === "monad" && (
          <div className="h-full w-full p-0">
            <ClientOnly
              fallback={
                <div className="rx-swap__fallback">
                  <WidgetSkeleton
                    config={{
                      ...baseWidgetConfig,
                      toToken: toTokenAddress ? toTokenAddress : undefined,
                    }}
                  />
                </div>
              }
            >
              <LiFiWidget
                key={`lifi-monad-${toTokenAddress || "none"}`}
                integrator="huntonraptor"
                fee={0.01}
                config={{
                  ...baseWidgetConfig,
                  fromChain: ChainId.MON, // Monad chain id (testnet/mainnet as configured by LiFi)
                  fromToken: "0x0000000000000000000000000000000000000000", // MON native
                  toChain: ChainId.MON,
                  toToken: toTokenAddress ? toTokenAddress : undefined,
                }}
              />
            </ClientOnly>
          </div>
        )}

        {/* Explicit Robinhood Chain configuration (LiFi chain id 4663, native ETH) */}
        {resolvedChain === "robinhood" && (
          <div className="w-full p-0">
            <ClientOnly
              fallback={
                <div className="rx-swap__fallback">
                  <WidgetSkeleton
                    config={{
                      ...baseWidgetConfig,
                      toToken: toTokenAddress ? toTokenAddress : undefined,
                    }}
                  />
                </div>
              }
            >
              <LiFiWidget
                key={`lifi-robinhood-${toTokenAddress || "none"}`}
                integrator="huntonraptor"
                fee={0.01}
                config={{
                  ...baseWidgetConfig,
                  fromChain: 4663,
                  fromToken: "0x0000000000000000000000000000000000000000",
                  toChain: 4663,
                  toToken: toTokenAddress ? toTokenAddress : undefined,
                }}
              />
            </ClientOnly>
          </div>
        )}

        {/* Fallback: let LiFi widget handle chain selection for other cases */}
        {resolvedChain === undefined && (
          <div className="h-full w-full p-0">
            <ClientOnly
              fallback={
                <div className="rx-swap__fallback">
                  <WidgetSkeleton
                    config={{
                      ...baseWidgetConfig,
                      toToken: toTokenAddress ? toTokenAddress : undefined,
                    }}
                  />
                </div>
              }
            >
              <LiFiWidget
                key={`lifi-auto-${toTokenAddress || "none"}`}
                integrator="huntonraptor"
                fee={0.01}
                config={{
                  ...baseWidgetConfig,
                  toToken: toTokenAddress ? toTokenAddress : undefined,
                }}
              />
            </ClientOnly>
          </div>
        )}
      </div>
    </div>
  );
}

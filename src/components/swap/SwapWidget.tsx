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

interface SwapWidgetProps {
  currentUserId: string;
  toTokenAddress?: string | null;
  forceChain?: "solana" | "bsc" | "base" | "monad";
  walletAddress?: string | null;
}

type HandlerRefs = {
  currentUserId: string | undefined;
  toTokenAddress: string | null | undefined;
  resolvedChain: "solana" | "bsc" | "base" | "monad" | undefined;
  walletAddress: string | null | undefined;
};

function resolveChain(
  forceChain: "solana" | "bsc" | "base" | "monad" | undefined,
  _toTokenAddress: string | null | undefined,
): "solana" | "bsc" | "base" | "monad" | undefined {
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
    // buildUrl: true,
    hiddenUI: ["bridgesSettings", "appearance", "language", "poweredBy"],
    theme: {
      container: {
        boxShadow: "0px 8px 32px rgba(0, 0, 0, 0.08)",
        borderRadius: "16px",
        height: "fit-content",
        border: "none",
      },
      palette: {
        primary: { main: "#ffc000" },
        secondary: { main: "#00b050" },
        background: { paper: "#1a1a1a", default: "#0a0a0a" },
        mode: "dark",
      },
      shape: { borderRadius: 12 },
      components: {
        MuiButton: {
          styleOverrides: {
            containedPrimary: {
              color: "#ffc000",
            },
            outlinedPrimary: {
              color: "#ffc000",
            },
            textPrimary: {
              color: "#fff",
            },
          },
        },
      },
    },
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
        chain:
          chain === "bsc"
            ? "bnb"
            : chain === "base"
              ? "base"
              : "solana",
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
    <div ref={containerRef} className="w-full h-full bg-black">
      <div className="h-full overflow-y-auto overflow-x-hidden">
        {/* Explicit BSC configuration */}
        {resolvedChain === "bsc" && (
          <div className="w-full p-0">
            <ClientOnly
              fallback={
                <div className="flex items-center justify-center h-full">
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

        {/* Explicit Base configuration */}
        {resolvedChain === "base" && (
          <div className="w-full p-0">
            <ClientOnly
              fallback={
                <div className="flex items-center justify-center h-full">
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

        {/* Explicit Solana configuration */}
        {resolvedChain === "solana" && (
          <div className="h-full w-full p-0">
            <ClientOnly
              fallback={
                <div className="flex items-center justify-center h-full bg-gray-800">
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
                <div className="flex items-center justify-center h-full bg-gray-800">
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

        {/* Fallback: let LiFi widget handle chain selection for other cases */}
        {resolvedChain === undefined && (
          <div className="h-full w-full p-0">
            <ClientOnly
              fallback={
                <div className="flex items-center justify-center h-full bg-gray-800">
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

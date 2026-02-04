/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useCallback } from "react";
import { LiFiWidget, WidgetSkeleton, type WidgetConfig, useWidgetEvents, WidgetEvent } from "@lifi/widget";
import type { Route } from "@lifi/sdk";
import { ClientOnly } from "./ClientOnly";

interface SwapWidgetProps {
  currentUserId: string;
  toTokenAddress?: string | null;
  forceChain?: "solana" | "bsc";
}

export function SwapWidget({ currentUserId, toTokenAddress, forceChain }: SwapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetEvents = useWidgetEvents();
  const processedSwapsRef = useRef<Set<string>>(new Set());
  const isProcessingRef = useRef(false);
  const processingRouteIdsRef = useRef<Set<string>>(new Set());
  const registeredWidgetEventsRef = useRef<typeof widgetEvents | null>(null);
  const handlerRefsRef = useRef({
    currentUserId,
    toTokenAddress,
    resolvedChain: forceChain
      ? forceChain
      : toTokenAddress && toTokenAddress.toLowerCase().startsWith("0x")
      ? "bsc"
      : "solana",
  });

  const resolvedChain: "solana" | "bsc" = forceChain
    ? forceChain
    : toTokenAddress && toTokenAddress.toLowerCase().startsWith("0x")
    ? "bsc"
    : "solana";

  // Update refs when props change
  useEffect(() => {
    handlerRefsRef.current = {
      currentUserId,
      toTokenAddress,
      resolvedChain,
    };
  }, [currentUserId, toTokenAddress, resolvedChain]);

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
  };

  // Use a stable function reference that reads from refs to prevent re-registration
  // RouteExecutionCompleted ONLY fires when execution is completed successfully (per LiFi docs)
  const handleSwapCompleted = useCallback(async (route: Route) => {
      const { currentUserId: userId, toTokenAddress: tokenAddr, resolvedChain: chain } = handlerRefsRef.current;
      
      if (!userId) {
        return;
      }

      // Create a unique identifier for this swap transaction (without timestamp for deduplication)
      const routeId = (route as any).id || 
                      `${userId}-${route.fromToken?.address || ''}-${route.toToken?.address || ''}-${route.fromAmount || ''}-${route.fromAmountUSD || ''}-${route.steps?.length || 0}`;
      
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
        const fromToken = route.fromToken?.symbol || route.fromToken?.address || route.fromToken?.name || "unknown";
        const toToken = route.toToken?.symbol || route.toToken?.address || route.toToken?.name || "unknown";

        // Get amount in USD - use fromAmountUSD if available, otherwise calculate from fromAmount
        let amountUSDValue = 0;
        if (route.fromAmountUSD) {
          amountUSDValue = Number(route.fromAmountUSD);
        } else if (route.fromAmount && route.fromToken?.priceUSD) {
          amountUSDValue = Number(route.fromAmount) * Number(route.fromToken.priceUSD);
        } else if (route.fromAmount) {
          // Try to get price from route itself
          const routePriceUSD = (route as any).fromTokenPriceUSD || (route as any).priceUSD;
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
          ? (toToken.toLowerCase() === tokenAddr.toLowerCase() || 
             route.toToken?.address?.toLowerCase() === tokenAddr.toLowerCase())
          : true; // Default to true if no specific token is targeted

        const requestBody = {
          amountUSD: amountUSDValue,
          fromToken,
          toToken,
          fromAddress,
          toAddress,
          chain: chain === "bsc" ? "bnb" : "solana",
          isBuy,
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
    
    // ONLY register RouteExecutionCompleted - this event ONLY fires when swap completes successfully
    // We do NOT listen to RouteExecutionUpdated since that fires during intermediate steps
    try {
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
      if (widgetEvents?.all?.clear) {
        widgetEvents.all.clear();
      } else {
        // Fallback cleanup
        try {
          widgetEvents.off(WidgetEvent.RouteExecutionCompleted, handleSwapCompleted);
        } catch (err) {
          try {
            widgetEvents.off("routeExecutionCompleted" as any, handleSwapCompleted);
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
      </div>
    </div>
  );
}



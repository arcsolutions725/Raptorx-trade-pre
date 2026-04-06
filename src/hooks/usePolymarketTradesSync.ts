"use client";

import { useEffect, useRef, useContext } from "react";
import { TradingContext } from "@/providers/TradingProvder";
import useTrades, { type PolymarketTrade } from "@/hooks/useTrades";

/**
 * Syncs Polymarket trades to our backend when the user has trades and wallet (and optional userId).
 * No-op if not inside TradingProvider. Call from PolymarketTradingInterface.
 */
export function usePolymarketTradesSync(userId: string | null | undefined) {
  const trading = useContext(TradingContext);
  const clobClient = trading?.clobClient ?? null;
  const eoaAddress = trading?.eoaAddress;
  const { data: trades = [] } = useTrades(clobClient, eoaAddress, 200);
  const lastSynced = useRef<string>("");

  useEffect(() => {
    if (!eoaAddress || !trades.length) return;

    const payload = JSON.stringify({
      walletAddress: eoaAddress,
      trades: trades.map((t: PolymarketTrade) => ({
        id: t.id,
        maker_address: t.maker_address,
        taker_address: t.taker_address,
        size: t.size,
        price: t.price,
        match_time: t.match_time,
      })),
    });
    if (lastSynced.current === payload) return;
    lastSynced.current = payload;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (userId) headers["x-user-id"] = userId;

    fetch("/api/polymarket/trades/sync", {
      method: "POST",
      headers,
      body: payload,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (process.env.NODE_ENV !== "production" && d)
          console.log("[Polymarket] Trades synced:", d);
      })
      .catch((err) =>
        console.warn("[Polymarket] Trades sync failed:", err)
      );
  }, [eoaAddress, userId, trades]);
}

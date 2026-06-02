"use client";

import { useEffect, useState } from "react";

export type LivePriceTick = {
  price: number;
  timeMs: number;
};

const LIVE_POLL_MS = 10_000;

/** Live price via CoinGecko (server-proxied with shared cache). */
export function useCryptoLivePriceStream(
  symbol: string | null | undefined,
  enabled = true
): {
  tick: LivePriceTick | null;
  connected: boolean;
  error: Error | null;
} {
  const [tick, setTick] = useState<LivePriceTick | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const normalized = String(symbol ?? "")
    .trim()
    .toUpperCase();

  useEffect(() => {
    setTick(null);
    setConnected(false);
    setError(null);

    if (!enabled || !normalized) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/predictfun/crypto-price/latest?symbol=${encodeURIComponent(normalized)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || "Live price fetch failed");
        }
        const json = (await res.json()) as { price?: number; timestamp?: number };
        const price = Number(json.price);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error("Invalid live price");
        }
        if (cancelled) return;
        setTick({
          price,
          timeMs: typeof json.timestamp === "number" ? json.timestamp : Date.now(),
        });
        setConnected(true);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    };

    poll();
    const id = window.setInterval(poll, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [normalized, enabled]);

  return { tick, connected, error };
}

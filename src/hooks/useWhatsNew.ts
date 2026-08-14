"use client";

import { useCallback, useRef, useState } from "react";
import type { WhatsNewResult } from "@/components/ui/modal/WhatsNewModal";

type Args = {
  contractAddress: string;
  ticker: string;
  projectName?: string;
  chain?: string;
};

export function useWhatsNew(userId?: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatsNewResult | null>(null);
  const inFlightRef = useRef(false);

  const clear = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  const fetchWhatsNew = useCallback(
    async ({ contractAddress, ticker, projectName, chain }: Args) => {
      if (!userId) throw new Error("Sign in to view What's New.");
      if (!ticker?.trim()) {
        throw new Error("Missing ticker.");
      }
      if (inFlightRef.current) return null;

      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch("/api/whats-new", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
          body: JSON.stringify({
            contractAddress,
            ticker,
            projectName,
            chain,
          }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        const next: WhatsNewResult = {
          summary: String(json.summary || ""),
          tweets: Array.isArray(json.tweets) ? json.tweets : [],
          metadata: json.metadata,
        };
        setResult(next);
        return next;
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to load What's New.";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [userId],
  );

  return {
    loading,
    error,
    result,
    fetchWhatsNew,
    clear,
  };
}

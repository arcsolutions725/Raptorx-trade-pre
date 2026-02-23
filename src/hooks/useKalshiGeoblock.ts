import { useState, useEffect, useCallback } from "react";

export type KalshiGeoblockStatus = {
  blocked: boolean;
  ip?: string;
  country: string;
  region: string;
};

type UseKalshiGeoblockReturn = {
  isBlocked: boolean;
  isLoading: boolean;
  error: Error | null;
  geoblockStatus: KalshiGeoblockStatus | null;
  recheckGeoblock: () => Promise<void>;
};

/**
 * Checks if the user is in a Kalshi restricted jurisdiction per the Member Agreement.
 * Used to disable placing orders on Kalshi when the user is in a restricted country.
 */
export default function useKalshiGeoblock(): UseKalshiGeoblockReturn {
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [geoblockStatus, setGeoblockStatus] =
    useState<KalshiGeoblockStatus | null>(null);

  const checkGeoblock = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/kalshi/geoblock", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Kalshi geoblock API error: ${response.status}`);
      }

      const data: KalshiGeoblockStatus = await response.json();
      setGeoblockStatus(data);
      setIsBlocked(data.blocked);
    } catch (err) {
      const e =
        err instanceof Error
          ? err
          : new Error("Failed to check Kalshi geoblock");
      setError(e);
      console.error("Kalshi geoblock check failed:", e);
      setIsBlocked(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkGeoblock();
  }, [checkGeoblock]);

  return {
    isBlocked,
    isLoading,
    error,
    geoblockStatus,
    recheckGeoblock: checkGeoblock,
  };
}

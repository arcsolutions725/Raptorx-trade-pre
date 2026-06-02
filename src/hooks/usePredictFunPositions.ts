/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  extractPredictFunPositionsList,
  readPredictFunAccountAddressFromBody,
} from "@/lib/predictfun/parsePredictFunPositions";
import { predictFunPositionsAddressCandidates } from "@/lib/predictfun/positionsAddress";
import { writePredictFunPredictAccount } from "@/lib/predictfun/predictFunAccountStorage";
import type { PredictFunChainId } from "@/lib/predictfun/orderEip712";

export type PredictFunPosition = {
  tokenId?: string;
  balance?: string;
  marketId?: number;
  outcome?: string;
  [k: string]: any;
};

export type PredictFunPositionsResponse = {
  success?: boolean;
  data?: {
    positions?: PredictFunPosition[];
    usdtBalanceWei?: string;
    [k: string]: any;
  };
  [k: string]: any;
};

function mergePositionsBodies(bodies: PredictFunPositionsResponse[]): PredictFunPositionsResponse {
  const merged: PredictFunPosition[] = [];
  const byToken = new Map<string, PredictFunPosition>();

  for (const body of bodies) {
    const list = extractPredictFunPositionsList(body);
    for (const p of list) {
      const key = String(
        p?.tokenId ?? p?.id ?? JSON.stringify(p?.marketId ?? p?.market?.id ?? merged.length)
      );
      if (!byToken.has(key)) {
        byToken.set(key, p);
        merged.push(p);
      }
    }
  }

  const first = bodies[0];
  const firstData =
    typeof first?.data === "object" && first?.data && !Array.isArray(first.data)
      ? first.data
      : {};

  return {
    success: true,
    data: {
      ...firstData,
      positions: merged,
    },
  };
}

async function fetchPredictFunDepositAddress(jwt: string): Promise<string | null> {
  const res = await fetch("/api/predictfun/account", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return readPredictFunAccountAddressFromBody(json);
}

async function fetchPositionsForAddress(
  address: string,
  jwt: string | null
): Promise<PredictFunPositionsResponse> {
  const params = new URLSearchParams();
  params.set("address", address);
  params.set("first", "100");
  const headers: Record<string, string> = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`/api/predictfun/positions?${params}`, {
    cache: "no-store",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Positions fetch failed");
  }
  return (await res.json()) as PredictFunPositionsResponse;
}

export type UsePredictFunPositionsOptions = {
  walletAddress?: string | null;
  chainId?: PredictFunChainId;
  tradingAddress?: string | null;
};

/**
 * GET /v1/positions/{address} per https://api.predict.fun/docs#get-positions-by-address
 * Uses Predict Account deposit address when available (from auth / GET /account).
 */
export function usePredictFunPositions(
  positionsAddress: string | null,
  enabled = true,
  jwt: string | null = null,
  alsoQueryAddresses: string[] = [],
  options?: UsePredictFunPositionsOptions
) {
  const walletAddress = options?.walletAddress ?? positionsAddress;
  const chainId = options?.chainId ?? 56;
  const tradingAddress = options?.tradingAddress ?? null;

  const query = useQuery({
    queryKey: [
      "predictfun-positions",
      positionsAddress,
      alsoQueryAddresses,
      jwt,
      walletAddress,
      chainId,
      tradingAddress,
    ],
    enabled: enabled && !!(positionsAddress || walletAddress),
    queryFn: async (): Promise<PredictFunPositionsResponse> => {
      let addresses = predictFunPositionsAddressCandidates(
        walletAddress!,
        chainId,
        tradingAddress ?? positionsAddress
      );

      if (jwt) {
        const deposit = await fetchPredictFunDepositAddress(jwt);
        if (deposit) {
          writePredictFunPredictAccount(chainId, walletAddress!, deposit);
          const key = deposit.toLowerCase();
          if (!addresses.some((a) => a.toLowerCase() === key)) {
            addresses = [deposit, ...addresses];
          } else {
            addresses = [
              deposit,
              ...addresses.filter((a) => a.toLowerCase() !== key),
            ];
          }
        }
      }

      for (const extra of alsoQueryAddresses) {
        const a = extra?.trim();
        if (!a || !/^0x[a-fA-F0-9]{40}$/i.test(a)) continue;
        if (!addresses.some((x) => x.toLowerCase() === a.toLowerCase())) {
          addresses.push(a);
        }
      }

      if (addresses.length === 0 && positionsAddress) {
        addresses = [positionsAddress];
      }

      const bodies = await Promise.all(
        addresses.map((addr) => fetchPositionsForAddress(addr, jwt))
      );
      return bodies.length === 1 ? bodies[0]! : mergePositionsBodies(bodies);
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  return {
    positions: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

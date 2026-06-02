/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useQuery } from "@tanstack/react-query";
import { normalizePredictFunAddress } from "@/lib/predictfun/userAddress";

async function fetchPredictFunApi(
  path: string,
  options: { jwt?: string | null; search: URLSearchParams }
) {
  const q = options.search.toString();
  const url = q ? `${path}?${q}` : path;
  const headers: Record<string, string> = {};
  if (options.jwt) {
    headers.Authorization = `Bearer ${options.jwt}`;
  }
  const res = await fetch(url, { cache: "no-store", headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.detail || "Predict.fun request failed");
  }
  return res.json();
}

/** GET /v1/orders — JWT must belong to this wallet (orders filtered client-side too). */
export function usePredictFunOrdersHistory(
  jwt: string | null,
  address: string | null,
  enabled: boolean
) {
  const normalized = normalizePredictFunAddress(address);
  return useQuery({
    queryKey: ["predictfun-orders-history", normalized, jwt],
    enabled: enabled && !!jwt && !!normalized,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("first", "50");
      params.set("signer", normalized!);
      return fetchPredictFunApi("/api/predictfun/orders", {
        jwt,
        search: params,
      });
    },
    staleTime: 10_000,
  });
}

/**
 * GET /v1/orders/matches — requires signerAddress query (user fills only).
 * @see https://dev.predict.fun/get-order-match-events-25663812e0
 */
export function usePredictFunOrderMatches(
  jwt: string | null,
  address: string | null,
  enabled: boolean
) {
  const normalized = normalizePredictFunAddress(address);
  return useQuery({
    queryKey: ["predictfun-order-matches", normalized, jwt],
    enabled: enabled && !!normalized,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("first", "50");
      params.set("signerAddress", normalized!);
      return fetchPredictFunApi("/api/predictfun/orders/matches", {
        jwt,
        search: params,
      });
    },
    staleTime: 10_000,
  });
}

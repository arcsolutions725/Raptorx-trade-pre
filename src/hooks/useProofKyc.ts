"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { buildProofDeepLink, getProofSignMessage } from "@/lib/proof-kyc";

/** Fetches Proof verification status for a Solana address. */
async function fetchProofVerified(address: string): Promise<boolean> {
  const res = await fetch(
    `/api/kalshi/proof-verify?address=${encodeURIComponent(address)}`
  );
  const data = (await res.json().catch(() => ({}))) as { verified?: boolean };
  return res.ok && data.verified === true;
}

/** Sign the Proof KYC message (Uint8Array) and return base58 signature. */
export type SignProofMessageFn = (messageBytes: Uint8Array) => Promise<string>;

/**
 * Hook for Proof KYC (Kalshi). Check verification status and redirect to Proof
 * to complete KYC when the user needs to buy on prediction markets.
 */
export function useProofKyc(
  solanaAddress: string | null,
  signProofMessage: SignProofMessageFn | null
) {
  const queryClient = useQueryClient();
  const {
    data: isVerified = false,
    isLoading: isLoadingProof,
    error: proofError,
    refetch: refetchProof,
  } = useQuery({
    queryKey: ["proof-verify", solanaAddress ?? ""],
    queryFn: () => fetchProofVerified(solanaAddress!),
    enabled: !!solanaAddress && solanaAddress.length >= 32,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const startKycFlow = useCallback(async () => {
    if (!solanaAddress || !signProofMessage) return;
    try {
      const timestamp = Date.now();
      const message = getProofSignMessage(timestamp);
      const messageBytes = new TextEncoder().encode(message);
      const signatureB58 = await signProofMessage(messageBytes);
      if (!signatureB58) return;
      const redirectUri =
        typeof window !== "undefined"
          ? window.location.href
          : "https://dflow.net";
      const deepLink = buildProofDeepLink({
        wallet: solanaAddress,
        signature: signatureB58,
        timestamp,
        redirectUri,
      });
      queryClient.setQueryData(["proof-verify", solanaAddress], false);
      window.location.href = deepLink;
    } catch (_) {
      // Let caller show error (e.g. user rejected signature)
    }
  }, [solanaAddress, signProofMessage, queryClient]);

  return {
    isVerified,
    isLoadingProof,
    proofError,
    refetchProof,
    startKycFlow,
  };
}

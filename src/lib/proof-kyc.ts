/**
 * Proof KYC (DFlow) – identity verification for Kalshi prediction market buying.
 * Docs: https://pond.dflow.net/build/proof/introduction
 * Partner integration: https://pond.dflow.net/build/proof/partner-integration
 */

export const PROOF_DEEP_LINK_BASE = "https://dflow.net/proof";

/**
 * Build the Proof deep link URL. Caller must provide a pre-signed message.
 * Message format: "Proof KYC verification: {timestamp}" with timestamp in ms (13 digits).
 */
export function buildProofDeepLink(params: {
  wallet: string;
  signature: string;
  timestamp: number;
  redirectUri: string;
  projectId?: string;
}): string {
  const search = new URLSearchParams({
    wallet: params.wallet,
    signature: params.signature,
    timestamp: String(params.timestamp),
    redirect_uri: params.redirectUri,
  });
  if (params.projectId) search.set("projectId", params.projectId);
  return `${PROOF_DEEP_LINK_BASE}?${search.toString()}`;
}

/** Message format required by Proof for wallet ownership. */
export function getProofSignMessage(timestamp: number): string {
  return `Proof KYC verification: ${timestamp}`;
}

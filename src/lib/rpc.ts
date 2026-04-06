// lib/rpc.ts
// NOTE: This helper is safe to use in client components only with a NEXT_PUBLIC_ env var.
// The resulting URL (including any key) will still be visible in the browser/network tab.
export function getHeliusRpcUrl() {
  return (
    process.env.NEXT_PUBLIC_HELIUS_RPC_URL ??
    "https://api.mainnet-beta.solana.com"
  );
}
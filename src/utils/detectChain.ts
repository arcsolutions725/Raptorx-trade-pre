/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Detect blockchain chain from DexScreener data or other sources
 * Returns normalized chain identifier: "bsc", "ethereum", "base", "solana", or "monad"
 */
export function detectChainFromDexData(
  dexData: any
): "bsc" | "ethereum" | "base" | "solana" | "monad" {
  if (!dexData) return "solana";

  const chainId = dexData.chainId?.toLowerCase?.() ?? String(dexData.chainId ?? "");

  // Base chain detection (before BSC so "base" isn't missed)
  if (chainId === "base" || chainId === "8453") {
    return "base";
  }

  // BNB/BSC chain detection
  if (
    chainId === "bsc" ||
    chainId === "binance" ||
    chainId === "bnb" ||
    chainId === "56"
  ) {
    return "bsc";
  }

  // Ethereum mainnet detection
  if (chainId === "ethereum" || chainId === "eth" || chainId === "1") {
    return "ethereum";
  }

  // Monad chain detection
  if (chainId === "monad" || chainId === "10143") {
    return "monad";
  }

  // Default to Solana for any other chain or solana-specific chainIds
  return "solana";
}

/**
 * Detect chain from contract address pattern (fallback method)
 * BNB addresses are 42 characters starting with 0x
 * Solana addresses are 32-44 characters (base58)
 */
export function detectChainFromAddress(address: string): "bsc" | "solana" {
  if (!address) return "solana";

  // BNB/BSC addresses start with 0x and are 42 characters long
  if (address.startsWith("0x") && address.length === 42) {
    return "bsc";
  }

  // Solana addresses are base58 encoded and typically 32-44 characters
  // They don't start with 0x
  return "solana";
}

/**
 * Comprehensive chain detection combining multiple methods
 * Priority: Explicit > DexData > Address Pattern > Default
 */
export function detectChain(params: {
  dexData?: any;
  address?: string;
  explicitChain?: string;
}): "bsc" | "ethereum" | "base" | "solana" | "monad" {
  const { dexData, address, explicitChain } = params;

  // If explicitly provided (e.g. from frontend token.chainId), use it
  if (explicitChain) {
    const normalized = explicitChain.toLowerCase().trim();
    if (normalized === "base" || normalized === "8453") return "base";
    if (normalized === "bsc" || normalized === "bnb" || normalized === "56") return "bsc";
    if (normalized === "ethereum" || normalized === "eth" || normalized === "1")
      return "ethereum";
    if (normalized === "monad" || normalized === "10143") return "monad";
    return "solana";
  }

  // Try to detect from DexScreener data first
  if (dexData) {
    const chainFromDex = detectChainFromDexData(dexData);
    if (chainFromDex) return chainFromDex;
  }

  // Fallback to address pattern detection (0x => bsc; cannot distinguish Base from BSC by address alone)
  if (address) {
    return detectChainFromAddress(address);
  }

  // Default to Solana
  return "solana";
}

/**
 * True only for BSC when we would show BNB holder/safety analytics UI.
 * Non-EVM (base58) mints are never BSC for this purpose, even if chain metadata is wrong.
 */
export function isBscForBnbAnalyticsSections(params: {
  explicitChain?: string | null;
  dexData?: any;
  contractAddress?: string | null;
}): boolean {
  const addr = (params.contractAddress ?? "").trim();
  if (addr && !addr.startsWith("0x")) {
    return false;
  }
  return (
    detectChain({
      dexData: params.dexData,
      address: addr || undefined,
      explicitChain: params.explicitChain ?? undefined,
    }) === "bsc"
  );
}

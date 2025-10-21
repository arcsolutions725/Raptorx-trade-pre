/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Detect blockchain chain from DexScreener data or other sources
 * Returns normalized chain identifier: "bnb" or "solana"
 */
export function detectChainFromDexData(dexData: any): "bsc" | "solana" {
  if (!dexData) return "solana";

  const chainId = dexData.chainId?.toLowerCase();

  // BNB/BSC chain detection
  if (
    chainId === "bsc" ||
    chainId === "binance" ||
    chainId === "bnb" ||
    chainId === "56"
  ) {
    return "bsc";
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
 * Priority: DexData > Address Pattern > Default
 */
export function detectChain(params: {
  dexData?: any;
  address?: string;
  explicitChain?: string;
}): "bsc" | "solana" {
  const { dexData, address, explicitChain } = params;

  // If explicitly provided, use it
  if (explicitChain) {
    const normalized = explicitChain.toLowerCase();
    if (normalized === "bsc" || normalized === "bnb") return "bsc";
    return "solana";
  }

  // Try to detect from DexScreener data first
  if (dexData) {
    const chainFromDex = detectChainFromDexData(dexData);
    if (chainFromDex) return chainFromDex;
  }

  // Fallback to address pattern detection
  if (address) {
    return detectChainFromAddress(address);
  }

  // Default to Solana
  return "solana";
}

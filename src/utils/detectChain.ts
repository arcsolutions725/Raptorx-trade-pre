/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Detect blockchain chain from DexScreener data or other sources.
 * Returns a normalized chain identifier, which is what gets persisted as `Report.chain`
 * and later pins the Exchange (Li.Fi) widget — so a wrong answer here means a report
 * whose swap widget is stuck on the wrong chain.
 */
import { normalizeSwapChain, type SwapChain } from "@/lib/swapChain";

export type DetectedChain = SwapChain;

/**
 * DexScreener responses come in two shapes: a bare pair (has `chainId`) and a token
 * profile (`{ pairs: [...] }`, no top-level `chainId`). `getTokenData` returns the
 * latter, so reading only `dexData.chainId` found nothing and every token fell through
 * to the Solana default. Check the pairs too.
 */
function chainIdFromDexData(dexData: any): string {
  const direct = dexData?.chainId;
  if (direct != null && String(direct).trim() !== "") return String(direct);

  const pairs = Array.isArray(dexData?.pairs) ? dexData.pairs : [];
  for (const p of pairs) {
    const c = p?.chainId;
    if (c != null && String(c).trim() !== "") return String(c);
  }
  return "";
}

export function detectChainFromDexData(dexData: any): DetectedChain {
  if (!dexData) return "solana";
  return normalizeSwapChain(chainIdFromDexData(dexData)) ?? "solana";
}

/**
 * Detect chain from contract address pattern (fallback method).
 * EVM addresses are 42 characters starting with 0x; Solana addresses are base58.
 * An 0x address cannot tell us WHICH EVM chain it is on — the bsc guess is a legacy
 * default, and callers with any better signal should not be relying on this.
 */
export function detectChainFromAddress(address: string): "bsc" | "solana" {
  if (!address) return "solana";

  if (address.startsWith("0x") && address.length === 42) {
    return "bsc";
  }

  return "solana";
}

/**
 * Comprehensive chain detection combining multiple methods.
 * Priority: Explicit > DexData > Address Pattern > Default
 */
export function detectChain(params: {
  dexData?: any;
  address?: string;
  explicitChain?: string;
}): DetectedChain {
  const { dexData, address, explicitChain } = params;

  // If explicitly provided (e.g. from frontend token.chainId), use it. An unrecognized
  // value used to fall through to "solana" here, which is how Robinhood tokens — whose
  // chain WAS passed correctly — still ended up stored as Solana.
  if (explicitChain) {
    const normalized = normalizeSwapChain(explicitChain);
    if (normalized) return normalized;
  }

  if (dexData) {
    const chainFromDex = normalizeSwapChain(chainIdFromDexData(dexData));
    if (chainFromDex) return chainFromDex;
  }

  if (address) {
    return detectChainFromAddress(address);
  }

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

import { readPredictFunPredictAccount } from "@/lib/predictfun/predictFunAccountStorage";
import type { PredictFunChainId } from "@/lib/predictfun/orderEip712";

/** Address passed to GET /v1/positions/{address} (Predict Account deposit or EOA). */
export function resolvePredictFunPositionsAddress(
  walletAddress: string,
  chainId: PredictFunChainId,
  tradingAddress?: string | null
): string {
  const eoa = walletAddress.trim();
  const trading = tradingAddress?.trim();
  if (trading && /^0x[a-fA-F0-9]{40}$/.test(trading)) {
    return trading;
  }
  const stored = readPredictFunPredictAccount(chainId, eoa);
  if (stored && /^0x[a-fA-F0-9]{40}$/.test(stored)) {
    return stored;
  }
  return eoa;
}

/** Extra wallet addresses to query when holdings may be split (EOA + Predict Account). */
export function predictFunPositionsAddressCandidates(
  walletAddress: string,
  chainId: PredictFunChainId,
  tradingAddress?: string | null
): string[] {
  const primary = resolvePredictFunPositionsAddress(
    walletAddress,
    chainId,
    tradingAddress
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const addr of [primary, walletAddress.trim(), tradingAddress?.trim()]) {
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  const stored = readPredictFunPredictAccount(chainId, walletAddress);
  if (stored && /^0x[a-fA-F0-9]{40}$/.test(stored)) {
    const key = stored.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(stored);
    }
  }
  return out;
}

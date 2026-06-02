const PREDICT_FUN_ACCOUNT_PREFIX = "predictfun_predict_account_v1";

export function getPredictFunAccountStorageKey(
  chainId: number,
  walletAddress: string
): string {
  return `${PREDICT_FUN_ACCOUNT_PREFIX}:${chainId}:${walletAddress.toLowerCase()}`;
}

export function readPredictFunPredictAccount(
  chainId: number,
  walletAddress: string
): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(
    getPredictFunAccountStorageKey(chainId, walletAddress)
  );
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw.trim())) return null;
  return raw.trim();
}

export function writePredictFunPredictAccount(
  chainId: number,
  walletAddress: string,
  predictAccount: string
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    getPredictFunAccountStorageKey(chainId, walletAddress),
    predictAccount.trim()
  );
}

export function clearPredictFunPredictAccount(
  chainId: number,
  walletAddress: string
): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getPredictFunAccountStorageKey(chainId, walletAddress));
}

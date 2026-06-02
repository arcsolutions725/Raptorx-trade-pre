/** Browser localStorage key for Predict.fun JWT (per wallet + API host + auth signer). */

export const PREDICT_FUN_JWT_STORAGE_PREFIX = "predictfun_jwt_v2";

export function getPredictFunJwtStorageKey(
  chainId: number,
  authSigner: string,
  apiBase?: string
): string {
  const base = (apiBase ?? "mainnet").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return `${PREDICT_FUN_JWT_STORAGE_PREFIX}:${base}:${chainId}:${authSigner.toLowerCase()}`;
}

export function readPredictFunJwt(
  chainId: number,
  authSigner: string,
  apiBase?: string
): string | null {
  if (typeof window === "undefined") return null;
  const cached = localStorage.getItem(
    getPredictFunJwtStorageKey(chainId, authSigner, apiBase)
  );
  if (!cached || cached.trim().length < 10) return null;
  return cached.trim();
}

export function writePredictFunJwt(
  chainId: number,
  authSigner: string,
  jwt: string,
  apiBase?: string
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    getPredictFunJwtStorageKey(chainId, authSigner, apiBase),
    jwt.trim()
  );
}

export function clearPredictFunJwt(
  chainId: number,
  authSigner: string,
  apiBase?: string
): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getPredictFunJwtStorageKey(chainId, authSigner, apiBase));
}

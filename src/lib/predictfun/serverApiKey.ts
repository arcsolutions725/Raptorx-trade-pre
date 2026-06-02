import { getPredictFunBaseUrl } from "@/lib/predictfun/serverFetch";

/** Mainnet Predict.fun requires x-api-key on all authenticated routes. */
export function predictFunMainnetRequiresApiKey(): boolean {
  const base = getPredictFunBaseUrl();
  return /api\.predict\.fun/i.test(base) && !/testnet/i.test(base);
}

export function assertPredictFunServerApiKey(): string | null {
  const key = process.env.PREDICT_FUN_API_KEY?.trim();
  if (predictFunMainnetRequiresApiKey() && !key) {
    return "Predict.fun API key is not configured on the server (PREDICT_FUN_API_KEY). Trading requires an API key on mainnet.";
  }
  return null;
}

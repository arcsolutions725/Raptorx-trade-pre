/** User-facing message from Predict.fun JSON error bodies. */
export function parsePredictFunApiErrorText(detail: string, fallback: string): string {
  const raw = String(detail ?? "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      error?: string;
      code?: number;
    };
    const msg = String(parsed?.message ?? parsed?.error ?? "").trim();
    if (parsed?.code === 401 || /unauthorized/i.test(msg)) {
      return "Predict.fun session expired or invalid. Please try again — your wallet will re-authenticate.";
    }
    if (msg) return msg;
  } catch {
    // not JSON
  }
  if (/unauthorized|authorization error/i.test(raw)) {
    return "Predict.fun session expired or invalid. Please try again.";
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

import type { MarketReport } from "@/hooks/useGenerateMarketReport";

export const PENDING_GENERATED_REPORT_KEY = "rexmarkets-pending-generated-report";

type Stashed = { report: MarketReport; savedAt: number };

export function stashPendingGeneratedReport(report: MarketReport) {
  try {
    const payload: Stashed = { report, savedAt: Date.now() };
    sessionStorage.setItem(PENDING_GENERATED_REPORT_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Read stashed report without removing (safe for React Strict Mode remounts). */
export function peekPendingGeneratedReport(maxAgeMs = 120_000): MarketReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_GENERATED_REPORT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Stashed;
    if (!data?.report || typeof data.savedAt !== "number") {
      sessionStorage.removeItem(PENDING_GENERATED_REPORT_KEY);
      return null;
    }
    if (Date.now() - data.savedAt > maxAgeMs) {
      sessionStorage.removeItem(PENDING_GENERATED_REPORT_KEY);
      return null;
    }
    return data.report;
  } catch {
    sessionStorage.removeItem(PENDING_GENERATED_REPORT_KEY);
    return null;
  }
}

export function clearPendingGeneratedReport() {
  try {
    sessionStorage.removeItem(PENDING_GENERATED_REPORT_KEY);
  } catch {
    /* ignore */
  }
}

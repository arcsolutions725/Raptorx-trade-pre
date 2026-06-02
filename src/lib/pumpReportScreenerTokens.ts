import {
  getReportScreenerTokenRows,
  type ReportScreenerFetchOptions,
  type ReportScreenerResult,
} from "@/lib/reportScreenerRows";

export type { ReportScreenerFetchOptions, ReportScreenerResult };

export async function getPumpReportScreenerTokenRows(
  opts: ReportScreenerFetchOptions = {},
): Promise<ReportScreenerResult> {
  return getReportScreenerTokenRows(false, opts);
}

import {
  getReportScreenerTokenRows,
  type ReportScreenerFetchOptions,
  type ReportScreenerResult,
} from "@/lib/reportScreenerRows";

export type { ReportScreenerFetchOptions, ReportScreenerResult };

export async function getGoldenReportScreenerTokenRows(
  opts: ReportScreenerFetchOptions = {},
): Promise<ReportScreenerResult> {
  return getReportScreenerTokenRows(true, opts);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useRef, useState } from "react";
import { getDexscreenerData } from "@/lib/api/dexscreener";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { ReportCache } from "@/lib/storage/reportCache";
import { useQueryClient } from "@tanstack/react-query";
import { reportGenStore } from "@/lib/storage/reportGenStore";
import { marketReportStreamStore } from "@/lib/storage/marketReportStreamStore";

export type Report = {
  id: string;
  contractAddress: string;
  ticker: string;
  projectName?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  dexData: any;
};

type GenerateArgs = {
  contractAddress: string;
  ticker: string;
  projectName?: string;
  /** Optional chain from token so the report is stored with correct chain for SwapWidget */
  chain?: "base" | "bsc" | "solana" | "monad";
};

/** Normalize token chainId to API chain value so the report is saved with correct chain */
function normalizeTokenChain(chainId?: string): "base" | "bsc" | "solana" | "monad" | undefined {
  if (!chainId) return undefined;
  const c = chainId.toLowerCase().trim();
  if (c === "base" || c === "8453") return "base";
  if (c === "bsc" || c === "bnb" || c === "56") return "bsc";
  if (c === "solana" || c === "sol") return "solana";
  if (c === "monad" || c === "10143") return "monad";
  return undefined;
}

type UseGenerateRexReportOptions = {
  onReportGenerated?: (report: Report) => void;
  userId?: string | null;
};

async function postGenerate(body: any, headers: Record<string, string>) {
  const res = await fetch("/api/generate-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

/** When SSE/client drops ids, recover from fresh list (matches API normAddr / list row). */
async function resolveReportIdFromCryptoList(
  userId: string,
  contractAddress: string,
): Promise<string | undefined> {
  const n = contractAddress.trim().toLowerCase();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(`/api/reports?reportType=crypto`, {
        headers: { "x-user-id": userId },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const list = (data.reports ?? []) as {
        id?: string;
        contractAddress?: string;
      }[];
      const hit = list.find(
        (x) =>
          x?.id &&
          x?.contractAddress &&
          x.contractAddress.trim().toLowerCase() === n,
      );
      if (hit?.id) return String(hit.id);
    } catch {
      /* retry */
    }
  }
  return undefined;
}

async function postGenerateStream(
  body: Record<string, unknown>,
  headers: Record<string, string>,
  onToken: (text: string) => void,
): Promise<{ res: Response; json: any }> {
  const res = await fetch("/api/generate-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      ...body,
      stream: true,
      /** RexScreener "Generate" must run a new pass (and SSE), not return a plain JSON cache hit. */
      forceRefresh: true,
    }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const json = await res.json().catch(() => ({}));
    const report = typeof json?.report === "string" ? json.report : "";
    if (report) onToken(report);
    if (json?.report != null) {
      return {
        res,
        json: { type: "done", ...json },
      };
    }
    return { res, json };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body from report stream.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: any = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      const line = block.trim();
      if (!line.startsWith("data: ")) continue;
      let data: { type?: string; text?: string; message?: string };
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (data.type === "token" && data.text) {
        onToken(data.text);
      }
      if (data.type === "done") {
        donePayload = data;
      }
      if (data.type === "error") {
        const err: any = new Error(
          (data as { message?: string }).message || "Stream error",
        );
        throw err;
      }
    }
  }

  if (!donePayload) {
    throw new Error("Report stream ended unexpectedly.");
  }

  return { res, json: donePayload };
}

export function useGenerateRexReport(opts: UseGenerateRexReportOptions = {}) {
  const { onReportGenerated, userId } = opts;
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const qc = useQueryClient();

  const commonBuildReport = useCallback(
    async (genJson: any, contractAddress: string, projectName?: string) => {
      const dexData = await getDexscreenerData(contractAddress).catch(() => ({
        error: "dex fetch failed",
      }));

      const reportIdRaw =
        genJson?.saved?.reportId ??
        (genJson?.saved as { id?: string } | undefined)?.id;
      // Build report object matching the API response structure
      const report: any = {
        id:
          reportIdRaw !== undefined && reportIdRaw !== null
            ? String(reportIdRaw)
            : undefined,
        contractAddress,
        ticker: genJson?.metadata?.ticker || genJson?.ticker,
        projectName,
        reportType: "crypto",
        content: genJson?.report || "",
        dexData,
        createdAt:
          typeof genJson?.saved?.createdAt === "string"
            ? genJson.saved.createdAt
            : genJson?.saved?.createdAt?.toISOString?.() ??
              new Date().toISOString(),
        updatedAt:
          typeof genJson?.saved?.updatedAt === "string"
            ? genJson.saved.updatedAt
            : genJson?.saved?.updatedAt?.toISOString?.() ??
              genJson?.saved?.createdAt ??
              new Date().toISOString(),
      };

      if (userId && contractAddress && !report.id) {
        const resolved = await resolveReportIdFromCryptoList(
          userId,
          contractAddress,
        );
        if (resolved) report.id = resolved;
      }

      // Also create Report type for backward compatibility
      const reportTyped: Report = {
        id: report.id ?? "",
        contractAddress: report.contractAddress,
        ticker: report.ticker,
        projectName: report.projectName,
        content: report.content,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        dexData: report.dexData,
      };

      if (userId && report.id) {
        ReportCache.setReport(userId, report.id, report);
      }

      if (userId) {
        // Update query cache for "crypto" reportType
        qc.setQueryData<any[]>(["reports", userId, "crypto"], (prev: any) => {
          const prevList = Array.isArray(prev) ? prev : [];
          const existingIdx = prevList.findIndex((r) => r.id === report.id);
          let next: any[];
          if (existingIdx >= 0) {
            next = prevList.slice();
            next[existingIdx] = { ...prevList[existingIdx], ...report };
          } else {
            next = [report, ...prevList];
          }
          return next;
        });

        // Update query cache for "all" reportType
        qc.setQueryData<any[]>(["reports", userId, "all"], (prev: any) => {
          const prevList = Array.isArray(prev) ? prev : [];
          const existingIdx = prevList.findIndex((r) => r.id === report.id);
          let next: any[];
          if (existingIdx >= 0) {
            next = prevList.slice();
            next[existingIdx] = { ...prevList[existingIdx], ...report };
          } else {
            next = [report, ...prevList];
          }
          // Update localStorage cache with all reports
          ReportCache.setReports(userId, next);
          return next;
        });
      }

      onReportGenerated?.(reportTyped);
      return reportTyped;
    },
    [onReportGenerated, qc, userId]
  );

  const generateFromFields = useCallback(
    async ({ contractAddress, ticker, projectName, chain }: GenerateArgs) => {
      if (!contractAddress?.trim() || !ticker?.trim()) {
        throw new Error("Missing contract address or ticker.");
      }
      if (!userId)
        throw new Error("Missing user id (cuid). Make sure you pass userId.");

      setError(null);

      // ⬇⬇ CHANGED: use getStartedAt
      if (reportGenStore.getStartedAt(contractAddress) > 0) return;

      inFlightRef.current = true;
      setIsGenerating(true);
      reportGenStore.start(contractAddress);
      marketReportStreamStore.start(contractAddress);

      try {
        const body: Record<string, unknown> = {
          contractAddress,
          ticker,
          projectName,
        };
        if (chain) body.chain = chain;
        const { res, json } = await postGenerateStream(
          body,
          { "x-user-id": userId },
          (t) => marketReportStreamStore.append(t),
        );
        if (!res.ok) {
          const err: any = new Error(json?.error || `HTTP ${res.status}`);
          err.status = res.status;
          err.code = json?.code;
          throw err;
        }
        const { type: _t, ...rest } = json;
        return await commonBuildReport(rest, contractAddress, projectName);
      } catch (err: any) {
        setError(err?.message || "Failed to generate report.");
        throw err;
      } finally {
        reportGenStore.finish(contractAddress);
        marketReportStreamStore.clear();
        setIsGenerating(false);
        inFlightRef.current = false;
      }
    },
    [userId, commonBuildReport]
  );

  const adminGenerateAndStoreFromToken = useCallback(
    async (
      t: TrendingToken,
      opts?: { confirmOverwrite?: (msg: string) => Promise<boolean> | boolean }
    ) => {
      const contractAddress = t.tokenAddress ?? "";
      const ticker = (t.symbol ?? "").toString();
      const projectName = t.name ?? undefined;

      if (!userId) throw new Error("Missing user id (cuid).");
      setError(null);

      // ⬇⬇ CHANGED: use getStartedAt
      if (reportGenStore.getStartedAt(contractAddress) > 0) return;

      setIsGenerating(true);
      inFlightRef.current = true;
      reportGenStore.start(contractAddress);

      const chain = normalizeTokenChain(t.chainId);
      try {
        const body: Record<string, unknown> = {
          contractAddress,
          ticker,
          projectName,
          storeToSystem: true,
        };
        if (chain) body.chain = chain;
        let { res, json } = await postGenerate(body, { "x-user-id": userId });

        if (res.status === 409 && json?.exists) {
          const ok =
            (await opts?.confirmOverwrite?.(
              "A report has already been created. Would you like to overwrite it?"
            )) ?? false;
          if (!ok) throw new Error("Admin cancelled overwrite.");

          const overwriteBody: Record<string, unknown> = {
            contractAddress,
            ticker,
            projectName,
            storeToSystem: true,
            overwrite: true,
          };
          if (chain) overwriteBody.chain = chain;
          ({ res, json } = await postGenerate(overwriteBody, { "x-user-id": userId }));
        }

        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return await commonBuildReport(json, contractAddress, projectName);
      } catch (err: any) {
        setError(err?.message || "Failed to generate & store report.");
        throw err;
      } finally {
        setIsGenerating(false);
        inFlightRef.current = false;
        reportGenStore.finish(contractAddress);
      }
    },
    [userId, commonBuildReport]
  );

  const generateFromToken = useCallback(
    async (t: TrendingToken) => {
      const contractAddress = t.tokenAddress ?? "";
      const ticker = t.symbol ?? "";
      const projectName = t.name ?? undefined;
      const chain = normalizeTokenChain(t.chainId);
      return generateFromFields({ contractAddress, ticker, projectName, chain });
    },
    [generateFromFields]
  );

  return {
    isGenerating,
    error,
    generateFromFields,
    generateFromToken,
    adminGenerateAndStoreFromToken,
  };
}

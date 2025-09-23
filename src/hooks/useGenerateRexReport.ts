/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useRef, useState } from "react";
import { getDexscreenerData } from "@/lib/api/dexscreener";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { ReportCache } from "@/lib/storage/reportCache";
import { useQueryClient } from "@tanstack/react-query";

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
};

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

export function useGenerateRexReport(opts: UseGenerateRexReportOptions = {}) {
  const { onReportGenerated, userId } = opts;
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const qc = useQueryClient(); // <--- add this

  const commonBuildReport = useCallback(
    async (genJson: any, contractAddress: string, projectName?: string) => {
      const dexData = await getDexscreenerData(contractAddress).catch(() => ({
        error: "dex fetch failed",
      }));

      const report: Report = {
        id: genJson?.saved?.reportId,
        contractAddress,
        ticker: genJson?.metadata?.ticker || genJson?.ticker,
        projectName,
        content: genJson?.report || "",
        createdAt: genJson?.saved?.createdAt ?? new Date().toISOString(),
        updatedAt: genJson?.saved?.updatedAt ?? new Date().toISOString(), // <— key line
        dexData,
      };

      // 1) Update the per-report cache (LocalStorage)
      if (userId && report.id) {
        ReportCache.setReport(userId, report.id, report);
      }

      // 2) Upsert into the list cache (React Query + LocalStorage) without refetching
      if (userId) {
        qc.setQueryData<any[]>(["reports", userId], (prev: any) => {
          const prevList = Array.isArray(prev) ? prev : [];

          // Upsert by id, newest first
          const existingIdx = prevList.findIndex((r) => r.id === report.id);
          let next: any[];
          if (existingIdx >= 0) {
            next = prevList.slice();
            next[existingIdx] = { ...prevList[existingIdx], ...report };
          } else {
            next = [report, ...prevList];
          }

          // Keep LocalStorage in sync
          ReportCache.setReports(userId, next);
          return next;
        });
      }

      // 3) Optional callback for UI
      onReportGenerated?.(report);

      return report;
    },
    [onReportGenerated, qc, userId]
  );

  const generateFromFields = useCallback(
    async ({ contractAddress, ticker, projectName }: GenerateArgs) => {
      if (!contractAddress?.trim() || !ticker?.trim()) {
        throw new Error("Missing contract address or ticker.");
      }
      if (!userId)
        throw new Error("Missing user id (cuid). Make sure you pass userId.");

      setError(null);
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsGenerating(true);

      try {
        const { res, json } = await postGenerate(
          { contractAddress, ticker, projectName },
          { "x-user-id": userId }
        );
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return await commonBuildReport(json, contractAddress, projectName);
      } catch (err: any) {
        setError(err?.message || "Failed to generate report.");
        throw err;
      } finally {
        setIsGenerating(false);
        inFlightRef.current = false;
      }
    },
    [userId, commonBuildReport]
  );

  // Admin path: store to systemreports, confirm overwrite on 409
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
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsGenerating(true);

      try {
        // First attempt: no overwrite
        let { res, json } = await postGenerate(
          { contractAddress, ticker, projectName, storeToSystem: true },
          { "x-user-id": userId }
        );

        if (res.status === 409 && json?.exists) {
          const ok =
            (await opts?.confirmOverwrite?.(
              "A report has already been created. Would you like to overwrite it?"
            )) ?? false;
          if (!ok) {
            throw new Error("Admin cancelled overwrite.");
          }
          // Retry with overwrite
          ({ res, json } = await postGenerate(
            {
              contractAddress,
              ticker,
              projectName,
              storeToSystem: true,
              overwrite: true,
            },
            { "x-user-id": userId }
          ));
        }

        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return await commonBuildReport(json, contractAddress, projectName);
      } catch (err: any) {
        setError(err?.message || "Failed to generate & store report.");
        throw err;
      } finally {
        setIsGenerating(false);
        inFlightRef.current = false;
      }
    },
    [userId, commonBuildReport]
  );

  const generateFromToken = useCallback(
    async (t: TrendingToken) => {
      const contractAddress = t.tokenAddress ?? "";
      const ticker = t.symbol ?? "";
      const projectName = t.name ?? undefined;
      return generateFromFields({ contractAddress, ticker, projectName });
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

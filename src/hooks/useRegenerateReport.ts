/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getDexscreenerData } from "@/lib/api/dexscreener";
import type { Report } from "@/hooks/useGenerateRexReport";

type RegenerateArgs = {
  reportId: string;
};

type UseRegenerateReportOptions = {
  onReportRegenerated?: (report: Report) => void;
  userId?: string | null;
};

async function postRegenerate(body: any, headers: Record<string, string>) {
  const res = await fetch("/api/regenerate-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export function useRegenerateReport(opts: UseRegenerateReportOptions = {}) {
  const { onReportRegenerated, userId } = opts;
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const queryClient = useQueryClient();

  const regenerateMutation = useMutation({
    mutationFn: async ({ reportId }: RegenerateArgs) => {
      if (!userId) throw new Error("Missing user id (cuid).");

      const { res, json } = await postRegenerate(
        { reportId },
        { "x-user-id": userId }
      );

      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      return json;
    },
    onSuccess: (data) => {
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["reports", userId] });
      queryClient.invalidateQueries({
        queryKey: ["report", userId, data.saved.reportId],
      });
    },
  });

  const commonBuildReport = useCallback(
    async (genJson: any, contractAddress: string, projectName?: string) => {
      const dexData = await getDexscreenerData(contractAddress).catch(() => ({
        error: "dex fetch failed",
      }));
      const report: Report = {
        id: genJson?.saved?.reportId,
        contractAddress,
        ticker: genJson?.metadata?.ticker || genJson?.ticker,
        projectName: projectName,
        content: genJson?.report || "",
        createdAt: genJson?.saved?.createdAt ?? new Date().toISOString(),
        updatedAt: genJson?.saved?.updatedAt ?? new Date().toISOString(),
        dexData,
      };
      onReportRegenerated?.(report);
      return report;
    },
    [onReportRegenerated]
  );

  const regenerateReport = useCallback(
    async ({ reportId }: RegenerateArgs) => {
      if (!userId) {
        throw new Error("Missing user id (cuid). Make sure you pass userId.");
      }

      setError(null);
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsRegenerating(true);

      try {
        const result = await regenerateMutation.mutateAsync({ reportId });

        // Build the report object with updated data
        const contractAddress = result.metadata.contractAddress;
        const projectName = result.metadata.projectName;

        return await commonBuildReport(
          {
            saved: { reportId: result.saved.reportId },
            report: result.report,
            metadata: result.metadata,
          },
          contractAddress,
          projectName
        );
      } catch (err: any) {
        setError(err?.message || "Failed to regenerate report.");
        throw err;
      } finally {
        setIsRegenerating(false);
        inFlightRef.current = false;
      }
    },
    [userId, regenerateMutation, commonBuildReport]
  );

  return {
    isRegenerating,
    error,
    regenerateReport,
  };
}

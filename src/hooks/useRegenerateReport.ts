/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getDexscreenerData } from "@/lib/api/dexscreener";
import type { Report } from "@/hooks/useGenerateRexReport";
import { marketReportStreamStore } from "@/lib/storage/marketReportStreamStore";

type RegenerateArgs = {
  reportId: string;
  /** When set, uses SSE (same UX as Rex Markets generate) and fills `marketReportStreamStore` */
  streamContractAddress?: string | null;
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

async function postRegenerateStream(
  body: Record<string, unknown>,
  headers: Record<string, string>,
  onToken: (text: string) => void,
): Promise<{ res: Response; json: any }> {
  const res = await fetch("/api/regenerate-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
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

  const invalidateAfterRegen = useCallback(
    (savedReportId: string) => {
      queryClient.invalidateQueries({ queryKey: ["reports", userId] });
      queryClient.invalidateQueries({
        queryKey: ["report", userId, savedReportId],
      });
    },
    [queryClient, userId],
  );

  const regenerateReport = useCallback(
    async ({ reportId, streamContractAddress }: RegenerateArgs) => {
      if (!userId) {
        throw new Error("Missing user id (cuid). Make sure you pass userId.");
      }

      setError(null);
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsRegenerating(true);

      const streamKey = streamContractAddress?.trim() || "";

      try {
        if (streamKey) {
          marketReportStreamStore.start(streamKey);
          try {
            const { res, json } = await postRegenerateStream(
              { reportId },
              { "x-user-id": userId },
              (t) => marketReportStreamStore.append(t),
            );
            if (!res.ok) {
              const err: any = new Error(json?.error || `HTTP ${res.status}`);
              throw err;
            }
            const { type: _t, ...rest } = json;
            const result = rest;
            const contractAddress = result.metadata.contractAddress;
            const projectName = result.metadata.projectName;
            invalidateAfterRegen(result.saved.reportId);
            return await commonBuildReport(
              {
                saved: {
                  reportId: result.saved.reportId,
                  updatedAt: result.saved.updatedAt,
                },
                report: result.report,
                metadata: result.metadata,
              },
              contractAddress,
              projectName,
            );
          } finally {
            marketReportStreamStore.clear();
          }
        }

        const result = await regenerateMutation.mutateAsync({ reportId });

        const contractAddress = result.metadata.contractAddress;
        const projectName = result.metadata.projectName;

        return await commonBuildReport(
          {
            saved: { reportId: result.saved.reportId },
            report: result.report,
            metadata: result.metadata,
          },
          contractAddress,
          projectName,
        );
      } catch (err: any) {
        setError(err?.message || "Failed to regenerate report.");
        throw err;
      } finally {
        setIsRegenerating(false);
        inFlightRef.current = false;
      }
    },
    [
      userId,
      regenerateMutation,
      commonBuildReport,
      invalidateAfterRegen,
    ],
  );

  return {
    isRegenerating,
    error,
    regenerateReport,
  };
}

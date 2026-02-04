/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useRef, useState } from "react";
import type { KalashiMarket } from "./useKalashiMarkets";
import type { PolymarketMarket } from "./usePolymarketMarkets";
import { ReportCache } from "@/lib/storage/reportCache";
import { useQueryClient } from "@tanstack/react-query";
import { reportGenStore } from "@/lib/storage/reportGenStore";
import { transformSeriesTitleToUrl } from "@/lib/utils/format";

export type MarketReport = {
  id: string;
  marketTicker: string;
  marketTitle: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  marketData: any;
};

type GenerateArgs = {
  marketTicker: string;
  marketTitle: string;
  marketData?: any;
};

type UseGenerateMarketReportOptions = {
  onReportGenerated?: (report: MarketReport) => void;
  userId?: string | null;
};

async function postGenerateMarket(body: any, headers: Record<string, string>) {
  const res = await fetch("/api/generate-market-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export function useGenerateMarketReport(
  opts: UseGenerateMarketReportOptions = {}
) {
  const { onReportGenerated, userId } = opts;
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const qc = useQueryClient();

  const commonBuildReport = useCallback(
    async (genJson: any, marketTicker: string, marketTitle: string) => {
      // Build report object matching the API response structure
      const report: any = {
        id: genJson?.saved?.reportId,
        contractAddress: marketTicker,
        ticker: marketTicker,
        projectName: marketTitle,
        reportType: "market",
        content: genJson?.report || "",
        marketData: genJson?.marketData || null,
        createdAt: genJson?.saved?.createdAt ?? new Date().toISOString(),
        updatedAt: genJson?.saved?.updatedAt ?? new Date().toISOString(),
      };

      // Also create MarketReport type for backward compatibility
      const marketReport: MarketReport = {
        id: report.id,
        marketTicker,
        marketTitle,
        content: report.content,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        marketData: report.marketData,
      };

      if (userId && report.id) {
        ReportCache.setReport(userId, report.id, report);
      }

      if (userId) {
        // Update query cache for all reportTypes (similar to useDeleteReport)
        // This ensures ChatSidebar with reportType="market" sees the new report
        ["all", "market"].forEach((type) => {
          qc.setQueryData<any[]>(["reports", userId, type], (prev: any) => {
            const prevList = Array.isArray(prev) ? prev : [];
            const existingIdx = prevList.findIndex((r) => r.id === report.id);
            let next: any[];
            if (existingIdx >= 0) {
              next = prevList.slice();
              next[existingIdx] = { ...prevList[existingIdx], ...report };
            } else {
              next = [report, ...prevList];
            }
            // Only update localStorage cache for "all" to avoid overwriting
            if (type === "all") {
              ReportCache.setReports(userId, next);
            }
            return next;
          });
        });
      }

      onReportGenerated?.(marketReport);
      return marketReport;
    },
    [onReportGenerated, qc, userId]
  );

  const generateFromFields = useCallback(
    async ({ marketTicker, marketTitle, marketData }: GenerateArgs) => {
      if (!marketTicker?.trim() || !marketTitle?.trim()) {
        throw new Error("Missing market ticker or title.");
      }
      if (!userId)
        throw new Error("Missing user id (cuid). Make sure you pass userId.");

      setError(null);

      if (reportGenStore.getStartedAt(marketTicker) > 0) return;

      inFlightRef.current = true;
      setIsGenerating(true);
      reportGenStore.start(marketTicker);

      try {
        const { res, json } = await postGenerateMarket(
          { marketTicker, marketTitle, marketData },
          { "x-user-id": userId }
        );
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return await commonBuildReport(json, marketTicker, marketTitle);
      } catch (err: any) {
        setError(err?.message || "Failed to generate market report.");
        throw err;
      } finally {
        setIsGenerating(false);
        inFlightRef.current = false;
        reportGenStore.finish(marketTicker);
      }
    },
    [userId, commonBuildReport]
  );

  const generateFromMarket = useCallback(
    async (market: KalashiMarket | PolymarketMarket) => {
      const marketTicker = market.ticker ?? "";
      const marketTitle = market.title ?? "";
      
      // Check if it's a Polymarket market
      const isPolymarket = 'rawEventData' in market || 'slug' in market;
      
      let marketData: any;
      
      if (isPolymarket) {
        // Handle Polymarket market
        const pmMarket = market as PolymarketMarket;
        // Use rawEventData if available, otherwise use the market object
        marketData = pmMarket.rawEventData || pmMarket;
        
        // Add image URL if available
        if (pmMarket.image || pmMarket.icon) {
          marketData.symbol_image_url = pmMarket.image || pmMarket.icon;
        }
      } else {
        // Handle Kalshi market
        const kalshiMarket = market as KalashiMarket;
        
        if (kalshiMarket.rawSeriesData) {
          // Use the full series data structure as provided by the API
          marketData = kalshiMarket.rawSeriesData;
          
          // Add symbol image URL if we have the required data
          const seriesTicker = marketData.series_ticker || kalshiMarket.series_ticker;
          
          if (seriesTicker) {
            // Use CloudFront URL format for symbol image
            marketData.symbol_image_url = `https://d1lvyva3zy5u58.cloudfront.net/series-images-webp/${seriesTicker}.webp?size=sm`;
          }
        } else {
          // Fall back to market data if rawSeriesData is not available
          marketData = kalshiMarket;
        }
      }
      
      return generateFromFields({ marketTicker, marketTitle, marketData });
    },
    [generateFromFields]
  );

  return {
    isGenerating,
    error,
    generateFromFields,
    generateFromMarket,
  };
}

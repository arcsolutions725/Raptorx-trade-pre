"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { usePathname } from "next/navigation";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import { useReports } from "@/hooks/useReports";
import ChatSidebar from "@/app/(rexscreener)/_components/rexchat/ChatSidebar";
import { PilotReportHistoryButton } from "@/app/(rexscreener)/_components/rexchat/PilotReportHistoryButton";
import { VenueBadge } from "@/app/rexmarkets/_components/RexMarketsTable/MarketDataTable/listUi";

import AIGeneratedMarketsReport from "./AIGeneratedMarketsReport";
import MarketsData from "./MarketsData";
import {
  ClawIco,
  ClawMark,
  IconBack,
  IconExpand,
  IconMin,
  IconX,
  ReportMark,
} from "./pilotUi";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useDataSource } from "@/contexts/DataSourceContext";

/** Rex Pilot / News split height, saved per viewer (same key as the prototype's drag gutter). */
const PILOT_H_KEY = "rx-size-pilot-h";
const PILOT_MIN_H = 140;
const NEWS_MIN_H = 160;

type PilotPlatform = "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun";

function pilotPlatformFromPathAndListing(
  pathname: string | null,
  listingSource: PilotPlatform | "all",
): PilotPlatform | null {
  const p = pathname || "";
  if (p.startsWith("/rexmarkets/polymarket/")) return "polymarket";
  if (p.startsWith("/rexmarkets/kalshi/")) return "kalshi";
  if (p.startsWith("/rexmarkets/limitless/")) return "limitless";
  if (p.startsWith("/rexmarkets/myriad/")) return "myriad";
  if (p.startsWith("/rexmarkets/predict-fun/")) return "predictfun";
  if (p === "/rexmarkets") {
    if (listingSource === "all") return null;
    return listingSource;
  }
  return null;
}

type RexMarketsReportDataProps = {
  generatedReport?: MarketReport | null;
  userId?: string | null;
  selectedReportId?: string | null;
  onReportSelect?: (reportId: string | null) => void;
  selectedMarketTicker?: string | null;
  selectedMarketTitle?: string | null;
  selectedMarketVolume?: number;
  selectedMarketEventId?: string | null;
  selectedMarketSource?: string | null;
  onClose?: () => void;
  onClearSessionReport?: () => void;
};

export default function RexMarketsReportData({
  generatedReport,
  userId,
  selectedReportId: externalSelectedReportId,
  onReportSelect,
  selectedMarketTicker,
  selectedMarketTitle,
  selectedMarketVolume,
  selectedMarketEventId,
  selectedMarketSource,
  onClose,
  onClearSessionReport,
}: RexMarketsReportDataProps) {
  const [aiReportMinimized, setAiReportMinimized] = useState(true);
  const [marketsDataMinimized, setMarketsDataMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [internalSelectedReportId, setInternalSelectedReportId] = useState<
    string | null
  >(generatedReport?.id || null);

  // Use external selectedReportId if provided, otherwise use internal state
  const selectedReportId = useMemo(
    () =>
      externalSelectedReportId !== undefined
        ? externalSelectedReportId
        : internalSelectedReportId,
    [externalSelectedReportId, internalSelectedReportId]
  );

  // Update selectedReportId and expand AI report when generatedReport changes
  useEffect(() => {
    if (generatedReport?.id) {
      if (onReportSelect) {
        onReportSelect(generatedReport.id);
      } else {
        setInternalSelectedReportId(generatedReport.id);
      }
      setAiReportMinimized(false);
    }
  }, [generatedReport?.id, onReportSelect]);

  // Expand AI report section when a report is selected from chat history
  useEffect(() => {
    if (selectedReportId) {
      setAiReportMinimized(false);
    }
  }, [selectedReportId]);

  // Prevent both sections from being minimized simultaneously
  useEffect(() => {
    if (aiReportMinimized && marketsDataMinimized) {
      setMarketsDataMinimized(false);
    }
  }, [aiReportMinimized, marketsDataMinimized]);

  // Memoized event handlers
  const handleExpandMarketsData = useCallback(() => {
    setMarketsDataMinimized(false);
  }, []);

  // Minimizing one pane gives the whole sidebar to the other (prototype pane states: both · pilot-min · news-min)
  const handleMinimizeMarketsData = useCallback(() => {
    setMarketsDataMinimized(true);
    setAiReportMinimized(false);
  }, []);

  const handleExpandAiReport = useCallback(() => {
    setAiReportMinimized(false);
  }, []);

  const handleMinimizeAiReport = useCallback(() => {
    setAiReportMinimized(true);
    setMarketsDataMinimized(false);
  }, []);

  const handleBackToEmptyState = useCallback(() => {
    if (onReportSelect) {
      onReportSelect(null);
    } else {
      setInternalSelectedReportId(null);
    }
    onClearSessionReport?.();
  }, [onReportSelect, onClearSessionReport]);

  const paneState = marketsDataMinimized
    ? "pilot-min"
    : aiReportMinimized
      ? "news-min"
      : "both";

  // ---- drag the line between Rex Pilot and the news report (prototype RXResize on #gSplit) ----
  const panesRef = useRef<HTMLDivElement>(null);
  const pilotPaneRef = useRef<HTMLElement>(null);
  const [pilotH, setPilotH] = useState<number | null>(null);
  const [splitActive, setSplitActive] = useState(false);

  useEffect(() => {
    try {
      const v = parseFloat(localStorage.getItem(PILOT_H_KEY) ?? "");
      if (!Number.isNaN(v)) setPilotH(v);
    } catch {
      /* storage blocked: keep the 50/50 split */
    }
  }, []);

  const clampPilotH = useCallback((v: number) => {
    const total = panesRef.current?.clientHeight ?? 0;
    const max = Math.max(PILOT_MIN_H, total - NEWS_MIN_H);
    return Math.round(Math.max(PILOT_MIN_H, Math.min(max, v)));
  }, []);

  const savePilotH = useCallback((v: number | null) => {
    try {
      if (v == null) localStorage.removeItem(PILOT_H_KEY);
      else localStorage.setItem(PILOT_H_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);

  const currentPilotH = useCallback(
    () => pilotPaneRef.current?.getBoundingClientRect().height ?? 0,
    [],
  );

  const onSplitPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const base = currentPilotH();
      let last = base;
      setSplitActive(true);
      document.body.classList.add("is-resizing");
      const move = (ev: globalThis.PointerEvent) => {
        last = clampPilotH(base + ev.clientY - startY);
        setPilotH(last);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        document.body.classList.remove("is-resizing");
        setSplitActive(false);
        savePilotH(last);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    },
    [clampPilotH, currentPilotH, savePilotH],
  );

  const onSplitKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 64 : 16;
      let next: number | null | undefined;
      if (e.key === "ArrowDown") next = clampPilotH(currentPilotH() + step);
      else if (e.key === "ArrowUp") next = clampPilotH(currentPilotH() - step);
      else if (e.key === "Home") next = null;
      if (next === undefined) return;
      e.preventDefault();
      setPilotH(next);
      savePilotH(next);
    },
    [clampPilotH, currentPilotH, savePilotH],
  );

  const resetSplit = useCallback(() => {
    setPilotH(null);
    savePilotH(null);
  }, [savePilotH]);

  const { data: serverReports = [] } = useReports(
    userId || undefined,
    "market"
  );

  const pathname = usePathname();
  const { dataSource: listingDataSource } = useDataSource();
  const pilotPlatform = useMemo(
    () => pilotPlatformFromPathAndListing(pathname, listingDataSource),
    [pathname, listingDataSource],
  );
  const isLimitlessRoute = pathname?.startsWith("/rexmarkets/limitless/");
  const isMyriadRoute = pathname?.startsWith("/rexmarkets/myriad/");
  const isPredictFunRoute = pathname?.startsWith("/rexmarkets/predict-fun/");
  const { marketDetails } = useMarketDetails(
    selectedMarketTicker || null,
    selectedMarketEventId || null,
    isLimitlessRoute || isMyriadRoute || isPredictFunRoute
      ? selectedMarketTicker ?? null
      : undefined,
  );
  const selectedMarketImageUrl = marketDetails?.symbol_image_url ?? null;

  const { isGenerating: marketReportGenActive } = useReportGenStatus(
    selectedMarketTicker || undefined,
  );

  // Market detail routes pass a ticker once details load; show Rex Pilot + News Intelligence stacked like the design.
  useEffect(() => {
    if (!selectedMarketTicker?.trim()) return;
    setAiReportMinimized(false);
  }, [selectedMarketTicker]);

  useEffect(() => {
    if (!marketReportGenActive || !selectedMarketTicker?.trim()) return;
    setAiReportMinimized(false);
  }, [marketReportGenActive, selectedMarketTicker]);

  const showPilotEmpty =
    aiReportMinimized &&
    !marketsDataMinimized &&
    !selectedReportId &&
    !selectedMarketTicker;

  const splitStyle =
    pilotH != null && paneState === "both"
      ? ({ "--pilot-h": `${clampPilotH(pilotH)}px` } as CSSProperties)
      : undefined;

  return (
    <>
      {/* Report history: slides over the whole sidebar (cards on phones, table rows in the 700px panel) */}
      <div
        className={`absolute top-0 left-0 h-full w-full z-[70] transform transition-transform duration-300 ${
          showHistory ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!showHistory}
        inert={!showHistory}
      >
        <div className="h-full relative">
          {userId && (
            <ChatSidebar
              userId={userId}
              currentReportId={selectedReportId || undefined}
              onSelectReport={(rid: string) => {
                if (onReportSelect) {
                  onReportSelect(rid);
                } else {
                  setInternalSelectedReportId(rid);
                }
                setShowHistory(false);
              }}
              onClose={() => setShowHistory(false)}
              reportType="market"
            />
          )}
        </div>
      </div>
      {showHistory && (
        <div
          className="absolute inset-0 z-[65] bg-black/50"
          onClick={() => setShowHistory(false)}
          aria-hidden="true"
        />
      )}

      <div className="sb-panes" data-state={paneState} ref={panesRef} style={splitStyle}>
        {/* ---------- Rex Pilot ---------- */}
        <section className="sb-pane sb-pane--pilot" aria-label="Rex Pilot" ref={pilotPaneRef}>
          {marketsDataMinimized ? (
            <div className="sb-min">
              {onClose ? (
                <button
                  type="button"
                  className="rx-icon-btn panel-ctl"
                  onClick={onClose}
                  aria-label="Close Rex Pilot panel"
                  title="Close"
                >
                  <IconX />
                </button>
              ) : null}
              <button
                type="button"
                className="sb-bar"
                onClick={handleExpandMarketsData}
                aria-label="Expand Rex Pilot"
              >
                <ClawMark size={16} />
                <span>
                  Expand <b>Rex Pilot</b>
                </span>
                <IconExpand />
              </button>
            </div>
          ) : (
            <>
              <div className="sb-head">
                {onClose ? (
                  <button
                    type="button"
                    className="rx-icon-btn panel-ctl"
                    onClick={onClose}
                    aria-label="Close Rex Pilot panel"
                    title="Close"
                  >
                    <IconX />
                  </button>
                ) : null}
                <ClawMark size={17} />
                <div className="panel__title">
                  <b>
                    <span className="t">Rex Pilot</span>
                    {pilotPlatform ? <VenueBadge venue={pilotPlatform} /> : null}
                  </b>
                  <span className="panel__sub">Your AI pilot for everything crypto</span>
                </div>
                <button
                  type="button"
                  className="rx-icon-btn panel-ctl"
                  onClick={handleMinimizeMarketsData}
                  aria-expanded="true"
                  aria-label="Minimize Rex Pilot"
                  title="Minimize"
                >
                  <IconMin />
                </button>
              </div>
              <div className="sb-pane__main">
                {showPilotEmpty ? (
                  <div className="sb-body">
                    <div className="empty">
                      <span className="empty__mark" aria-hidden="true">
                        <ClawIco size={34} />
                      </span>
                      <b>Rex Markets</b>
                      <p>
                        Conversational intelligence for event traders. Generate an intelligence
                        report for any prediction event.
                      </p>
                      {userId ? (
                        <PilotReportHistoryButton
                          count={serverReports.length}
                          onOpen={() => setShowHistory(true)}
                          className="mt-1"
                        />
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <MarketsData
                    eventTicker={selectedMarketTicker}
                    marketTitle={selectedMarketTitle}
                    totalVolume={selectedMarketVolume}
                    eventId={selectedMarketEventId}
                    marketSource={selectedMarketSource}
                  />
                )}
              </div>
            </>
          )}
        </section>

        {/* line between the panes; drag it (or use the arrow keys) to resize, double-click to reset */}
        {paneState === "both" ? (
          <div
            className={`sb-split${splitActive ? " is-active" : ""}`}
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label="Resize Rex Pilot and news report"
            aria-valuenow={pilotH != null ? clampPilotH(pilotH) : undefined}
            title="Drag to resize · double-click to reset"
            onPointerDown={onSplitPointerDown}
            onKeyDown={onSplitKeyDown}
            onDoubleClick={resetSplit}
          />
        ) : (
          <div className="sb-split" aria-hidden="true" />
        )}

        {/* ---------- News intelligence report ---------- */}
        <section className="sb-pane sb-pane--news" aria-label="News intelligence report">
          {aiReportMinimized ? (
            <div className="sb-min">
              <button
                type="button"
                className="sb-bar"
                onClick={handleExpandAiReport}
                aria-label="Expand news intelligence report"
              >
                <ReportMark size={12} />
                <span>
                  <b>News intelligence</b>&nbsp;report
                </span>
                <IconExpand />
              </button>
            </div>
          ) : (
            <>
              <div className="sb-head">
                {selectedReportId ? (
                  <button
                    type="button"
                    className="rx-icon-btn panel-ctl"
                    onClick={handleBackToEmptyState}
                    aria-label="Back to Generate"
                    title="Back"
                  >
                    <IconBack />
                  </button>
                ) : null}
                <ReportMark />
                <div className="panel__title">
                  <b>
                    <span className="t">News intelligence report</span>
                  </b>
                  <span className="panel__sub">
                    Real-time conversational news context, by your side
                  </span>
                </div>
                <div className="sb-head__tools">
                  {userId ? (
                    <PilotReportHistoryButton
                      variant="icon"
                      count={serverReports.length}
                      onOpen={() => setShowHistory(true)}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="rx-icon-btn panel-ctl"
                    onClick={handleMinimizeAiReport}
                    aria-expanded="true"
                    aria-label="Minimize news intelligence report"
                    title="Minimize"
                  >
                    <IconMin />
                  </button>
                </div>
              </div>
              <div className="sb-pane__main">
                <AIGeneratedMarketsReport
                  generatedReport={generatedReport}
                  userId={userId}
                  selectedReportId={selectedReportId}
                  reportGenLookupKey={selectedMarketTicker ?? null}
                  selectedMarketTitle={selectedMarketTitle ?? null}
                  selectedMarketImageUrl={selectedMarketImageUrl}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

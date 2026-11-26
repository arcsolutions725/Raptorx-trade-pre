"use client";

/**
 * Desktop token view: with both panes (Exchange and Intelligence report) minimized, the sidebar closes and
 * they park as vertical tabs on the right edge (prototype design/js/token.js .side-rail / .rail-tab).
 * A tab opens the sidebar with that pane expanded; the other stays minimized.
 * Styles: styles/pages/pilot.css (.rx-pilot-rail, shared with the prediction-market pages); desktop only.
 */

import { useEffect, useRef } from "react";
import { IconDoc } from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/pilotUi";
import { IconSwap } from "@/app/(rexscreener)/_components/rexchat/screenerSideUi";
import type { SheetPane } from "./TokenPhoneBar";

export function ParkedPanesRail({
  onRestore,
  sidebarId,
}: {
  onRestore: (pane: SheetPane) => void;
  /** id of the sidebar the tabs reopen */
  sidebarId: string;
}) {
  const railRef = useRef<HTMLElement>(null);

  // Parking happens from a minimize button inside the sidebar, which is now closed: keep keyboard focus
  // on the parked tabs instead of losing it to the page.
  useEffect(() => {
    const ae = document.activeElement;
    const sb = document.getElementById(sidebarId);
    if (!ae || ae === document.body || (sb && sb.contains(ae))) {
      railRef.current?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [sidebarId]);

  return (
    <nav className="rx-pilot-rail" aria-label="Minimized panels" ref={railRef}>
      <button
        type="button"
        className="rail-tab"
        onClick={() => onRestore("report")}
        aria-controls={sidebarId}
        title="Open the intelligence report"
      >
        <IconDoc size={14} />
        Intelligence report
      </button>
      <button
        type="button"
        className="rail-tab"
        onClick={() => onRestore("exchange")}
        aria-controls={sidebarId}
        title="Open the Exchange"
      >
        <IconSwap size={14} />
        Exchange
      </button>
    </nav>
  );
}

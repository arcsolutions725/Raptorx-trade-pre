"use client";

/**
 * Open / closed / parked state of the Rex Pilot sidebar on the prediction-market detail pages
 * (prototype design/js/market.js). Rendered by PilotSidebarLayout; RexMarketsReportData reads the pane types.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** id of the sidebar element (aria-controls of the Claw AI 5.0 buttons). */
export const PILOT_SIDEBAR_ID = "rex-pilot-sidebar";

const DESKTOP_MQ = "(min-width: 1024px)";

/** True when the sidebar docks beside the page (>=1024px) instead of covering it. */
export function isPilotDesktop(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_MQ).matches;
}

/** Rex Pilot pane states (prototype data-state): both · pilot-min · news-min. */
export type PilotPaneState = "both" | "pilot-min" | "news-min";
/** Ask the sidebar to show a pane state; `seq` makes every request new. */
export type PilotPaneRequest = { state: PilotPaneState; seq: number };

/** Move focus to the visible Claw AI 5.0 button that controls the sidebar (after closing it). */
function focusPilotToggle() {
  const buttons = document.querySelectorAll<HTMLElement>(
    `button[aria-controls="${PILOT_SIDEBAR_ID}"]`,
  );
  for (const b of buttons) {
    if (b.offsetParent !== null) {
      b.focus();
      return;
    }
  }
}

/** Open / closed / parked state of the Rex Pilot sidebar on a market page. */
export function usePilotSidebar() {
  // Decided before the first paint: open on desktop, closed on phones / tablets.
  const [open, setOpenState] = useState<boolean>(() =>
    typeof window === "undefined" ? true : isPilotDesktop(),
  );
  const [parked, setParked] = useState(false);
  const [paneRequest, setPaneRequest] = useState<PilotPaneRequest | null>(null);
  const seqRef = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;

  // A server-rendered first pass assumes desktop; correct it before paint on smaller screens.
  useLayoutEffect(() => {
    if (!isPilotDesktop()) setOpenState(false);
  }, []);

  const requestPanes = useCallback((state: PilotPaneState) => {
    seqRef.current += 1;
    setPaneRequest({ state, seq: seqRef.current });
  }, []);

  /** Open or close (report generated, pending report, phone report streaming, ...). */
  const setOpen = useCallback((next: boolean | ((open: boolean) => boolean)) => {
    setOpenState(next);
    setParked(false);
  }, []);

  /** Close (X, scrim, Esc). Focus goes back to the Claw AI 5.0 button when it was inside the sidebar. */
  const close = useCallback(() => {
    const sb = document.getElementById(PILOT_SIDEBAR_ID);
    const hadFocus = !!sb && sb.contains(document.activeElement);
    setOpenState(false);
    setParked(false);
    if (hadFocus) focusPilotToggle();
  }, []);

  /** Claw AI 5.0 buttons: close, or open with both panes. */
  const toggle = useCallback(() => {
    if (openRef.current) {
      close();
      return;
    }
    requestPanes("both");
    setParked(false);
    setOpenState(true);
  }, [close, requestPanes]);

  /** Both panes minimized (desktop): close the sidebar and park them as tabs on the right edge. */
  const park = useCallback(() => {
    setOpenState(false);
    setParked(true);
  }, []);

  /** A parked tab: open the sidebar with that pane expanded (the other stays minimized). */
  const restore = useCallback(
    (pane: "pilot" | "news") => {
      requestPanes(pane === "pilot" ? "news-min" : "pilot-min");
      setParked(false);
      setOpenState(true);
    },
    [requestPanes],
  );

  // Esc closes the full-screen overlay on phones / tablets
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isPilotDesktop()) return;
      close();
      focusPilotToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return { open, parked, paneRequest, setOpen, toggle, close, park, restore };
}

export type PilotSidebar = ReturnType<typeof usePilotSidebar>;

"use client";

/**
 * Page frame of every prediction-market detail page (kalshi / polymarket / limitless / myriad / predict-fun):
 * header + venue interface + footer on the left, the docked Rex Pilot sidebar on the right.
 * Behaviour from the prototype (design/js/market.js + design/js/resize.js):
 *  - the sidebar starts open on desktop (>=1024px) and closed on phones / tablets, where it is a full-screen
 *    overlay; Esc closes the overlay;
 *  - desktop: drag the sidebar's left edge to resize it (arrow keys too, Home / double-click resets; saved);
 *  - minimizing both panes parks them as vertical tabs on the right edge (`.rx-pilot-rail`); a tab opens the
 *    sidebar with that pane expanded.
 * Styles: styles/pages/market.css (.rx-mk-page) and styles/pages/pilot.css (.rx-pilot-rail).
 */

import "@/styles/pages/market.css";
import "@/styles/pages/pilot.css";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { ClawIco, IconDoc } from "../RexMarketsReportData/pilotUi";
import { loadSize, resizeKey, saveSize, startResizeDrag } from "./dragResize";
import { PILOT_SIDEBAR_ID, type PilotSidebar } from "./usePilotSidebar";

export { PILOT_SIDEBAR_ID, usePilotSidebar } from "./usePilotSidebar";

/* ---------------- sidebar width (desktop) ---------------- */

const SB_KEY = "sb-w";
const SB_MIN = 380;
const SB_DEF = 700;
/** The page keeps at least 560px; the sidebar never drops under 420px for that. */
const sbMax = () => Math.max(420, window.innerWidth - 560);
const clampSb = (v: number) => Math.round(Math.max(SB_MIN, Math.min(sbMax(), v)));
/** Same limits in CSS, so a saved width still fits after the window changes size. */
const sbWidthCss = (w: number) =>
  `max(${SB_MIN}px, min(max(420px, calc(100vw - 560px)), ${Math.round(w)}px))`;

/** Change a size without the 0.5s width animation of the page column (keyboard / reset). */
function withoutTransitions(fn: () => void) {
  const body = document.body;
  body.classList.add("is-resizing");
  fn();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!body.querySelector(".is-active[role='separator']")) body.classList.remove("is-resizing");
    }),
  );
}

type PilotSidebarLayoutProps = {
  sidebar: PilotSidebar;
  /** RexHeader (its Claw AI 5.0 button should call `sidebar.toggle`) */
  header: ReactNode;
  footer: ReactNode;
  /** RexMarketsReport (pass onClose={sidebar.close}, onParkBoth={sidebar.park}, paneRequest={sidebar.paneRequest}) */
  report: ReactNode;
  /** The venue trading interface */
  children: ReactNode;
  /** aria-busy while the signed-in user loads */
  busy?: boolean;
};

export function PilotSidebarLayout({
  sidebar,
  header,
  footer,
  report,
  children,
  busy,
}: PilotSidebarLayoutProps) {
  const { open, parked, close, restore } = sidebar;
  const scopeRef = useRef<HTMLDivElement>(null);
  const sbRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);

  const syncEdgeValue = useCallback(() => {
    const sb = sbRef.current;
    const edge = edgeRef.current;
    if (!sb || !edge) return;
    edge.setAttribute("aria-valuenow", String(Math.round(sb.getBoundingClientRect().width)));
    edge.setAttribute("aria-valuemax", String(sbMax()));
  }, []);

  /** Width in px, or null for the default (globals.css --rx-sb-w). Set on the page wrapper as --rx-sb-w,
   *  which both the sidebar and the shrinking page column read. */
  const applyWidth = useCallback(
    (w: number | null) => {
      const scope = scopeRef.current;
      if (!scope) return;
      if (w == null) scope.style.removeProperty("--rx-sb-w");
      else scope.style.setProperty("--rx-sb-w", sbWidthCss(w));
      syncEdgeValue();
    },
    [syncEdgeValue],
  );

  // Saved width applies before the first paint (no jump from the default)
  useLayoutEffect(() => {
    applyWidth(loadSize(SB_KEY));
  }, [applyWidth]);

  const resetWidth = useCallback(() => {
    withoutTransitions(() => applyWidth(null));
    saveSize(SB_KEY, null);
  }, [applyWidth]);

  const onEdgePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const sb = sbRef.current;
      if (!sb) return;
      const base = sb.getBoundingClientRect().width;
      let last = base;
      startResizeDrag(
        e,
        "x",
        (d) => {
          last = clampSb(base - d);
          applyWidth(last);
        },
        (moved) => {
          if (moved) saveSize(SB_KEY, last);
        },
      );
    },
    [applyWidth],
  );

  const onEdgeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const r = resizeKey(e, "ArrowLeft", "ArrowRight");
      if (r == null) return;
      e.preventDefault();
      if (r === "reset") {
        resetWidth();
        return;
      }
      const w = clampSb((sbRef.current?.getBoundingClientRect().width ?? SB_DEF) + r);
      withoutTransitions(() => applyWidth(w));
      saveSize(SB_KEY, w);
    },
    [applyWidth, resetWidth],
  );

  // Parking happens from a minimize button inside the sidebar; keep keyboard focus on the parked tabs.
  useEffect(() => {
    if (!parked) return;
    const ae = document.activeElement;
    const sb = sbRef.current;
    if (!ae || ae === document.body || (sb && sb.contains(ae))) {
      railRef.current?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [parked]);

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      aria-busy={busy}
      data-loading-user={busy || undefined}
    >
      <div className="rx-mk-page flex-1 flex overflow-hidden" ref={scopeRef}>
        <div
          className={`h-full flex flex-col w-full transition-[width] duration-500 ease-in-out ${
            open ? "main-content-shrink" : ""
          }`}
        >
          {header}
          <div className={`flex-1 overflow-hidden${parked ? " mk-page-main--rail" : ""}`}>
            {children}
          </div>
          {footer}
        </div>

        <div
          ref={sbRef}
          className={`fixed top-0 right-0 h-screen lg:h-full w-full sm:w-[500px] lg:w-[700px] bg-black z-[60] lg:z-auto transform transition-transform duration-500 ease-in-out ${
            open
              ? "translate-x-0 lg:relative lg:flex-shrink-0 pointer-events-auto"
              : "translate-x-full lg:absolute pointer-events-none"
          }`}
          role="dialog"
          id={PILOT_SIDEBAR_ID}
          aria-modal="true"
          aria-label="Rex Pilot and news intelligence"
          aria-hidden={!open}
          inert={!open}
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            maxHeight: "100dvh",
          }}
        >
          {open ? (
            // Desktop: drag the left edge to resize the sidebar (design/market.html #gSidebar)
            <div
              ref={edgeRef}
              className="mk-sb-edge"
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize Rex Pilot panel width"
              aria-valuemin={SB_MIN}
              title="Drag to resize · double-click to reset"
              onPointerDown={onEdgePointerDown}
              onKeyDown={onEdgeKeyDown}
              onDoubleClick={resetWidth}
              onFocus={syncEdgeValue}
            />
          ) : null}
          <div
            className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[#141414] custom-sidebar-scrollbar"
            style={{
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
              maxHeight: "100dvh",
            }}
          >
            {report}
          </div>
        </div>

        {open && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-50"
            onClick={close}
            aria-hidden="true"
            style={{ touchAction: "none" }}
          />
        )}

        {/* Both panes minimized: vertical tabs on the right edge (desktop) */}
        {parked ? (
          <nav className="rx-pilot-rail" aria-label="Minimized panels" ref={railRef}>
            <button
              type="button"
              className="rail-tab"
              onClick={() => restore("pilot")}
              title="Open Rex Pilot"
            >
              <ClawIco size={15} />
              Rex Pilot
            </button>
            <button
              type="button"
              className="rail-tab"
              onClick={() => restore("news")}
              title="Open the news intelligence report"
            >
              <IconDoc size={14} />
              News report
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

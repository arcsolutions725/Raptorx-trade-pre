"use client";

/**
 * Desktop (>=1024px): drag the left edge of the RexScreener sidebar to resize it — prototype
 * design/token.html #gSide + design/js/resize.js. Arrow keys too (Shift = bigger steps), Home /
 * double-click resets, the width is saved per viewer.
 *
 * Two sets of limits:
 * - "token" (a token is open: Exchange + Intelligence report beside the chart), design/js/token.js:
 *   440px by default, 340px at least, the chart keeps at least 480px; saved as "rx-size-tk-side-w".
 * - "list" (Rex Pilot / reports over the token list): the prediction pages' sidebar
 *   (rexmarkets/.../shared/PilotSidebarLayout.tsx, design/js/market.js): 700px by default, 380px at
 *   least, the page keeps at least 560px; saved as "rx-size-sb-w", shared with those pages.
 *
 * The width goes on the shell root as --rx-sb-w, which both the sidebar and the shrinking page column read
 * (src/app/globals.css). Styles: styles/pages/screener-side.css (.rx-screener .rx-sb-edge).
 */

import { useCallback, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import {
  loadSize,
  resizeKey,
  saveSize,
  startResizeDrag,
} from "@/app/rexmarkets/_components/RexMarketsReport/shared/dragResize";

export type SidebarKind = "token" | "list";

type Limits = {
  key: string;
  def: number;
  min: number;
  /** room the page column keeps */
  keep: number;
  /** the sidebar's upper limit never drops under this */
  floor: number;
};

const LIMITS: Record<SidebarKind, Limits> = {
  token: { key: "tk-side-w", def: 440, min: 340, keep: 480, floor: 380 },
  list: { key: "sb-w", def: 700, min: 380, keep: 560, floor: 420 },
};

const sbMax = (l: Limits) => Math.max(l.floor, window.innerWidth - l.keep);
const clampSb = (l: Limits, v: number) => Math.round(Math.max(l.min, Math.min(sbMax(l), v)));
/** Same limits in CSS, so a saved width still fits after the window changes size. */
const sbWidthCss = (l: Limits, w: number) =>
  `max(${l.min}px, min(max(${l.floor}px, calc(100vw - ${l.keep}px)), ${Math.round(w)}px))`;

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

/**
 * `scopeRef`: the element that carries --rx-sb-w (the shell root). `sidebarRef`: the sidebar itself
 * (its rendered width is the starting point of a drag or a key step).
 */
export function useSidebarWidth(
  scopeRef: RefObject<HTMLElement | null>,
  sidebarRef: RefObject<HTMLElement | null>,
  /** false while the scope element is not rendered (the saved width applies once it is) */
  active = true,
  /** "token" while a token is open, "list" over the token list */
  kind: SidebarKind = "list",
) {
  const edgeRef = useRef<HTMLDivElement>(null);
  const limits = LIMITS[kind];

  const syncEdgeValue = useCallback(() => {
    const sb = sidebarRef.current;
    const edge = edgeRef.current;
    if (!sb || !edge) return;
    edge.setAttribute("aria-valuenow", String(Math.round(sb.getBoundingClientRect().width)));
    edge.setAttribute("aria-valuemin", String(limits.min));
    edge.setAttribute("aria-valuemax", String(sbMax(limits)));
  }, [sidebarRef, limits]);

  /** Width in px, or null for this kind's default. */
  const applyWidth = useCallback(
    (w: number | null) => {
      const scope = scopeRef.current;
      if (!scope) return;
      scope.style.setProperty("--rx-sb-w", sbWidthCss(limits, w ?? limits.def));
      syncEdgeValue();
    },
    [scopeRef, syncEdgeValue, limits],
  );

  // The saved width applies before the first paint (no jump from the default), and again when the
  // view switches between the token page and the list (each keeps its own width).
  useLayoutEffect(() => {
    if (active) applyWidth(loadSize(limits.key));
  }, [active, applyWidth, limits]);

  const resetWidth = useCallback(() => {
    withoutTransitions(() => applyWidth(null));
    saveSize(limits.key, null);
  }, [applyWidth, limits]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const sb = sidebarRef.current;
      if (!sb) return;
      const base = sb.getBoundingClientRect().width;
      let last = base;
      startResizeDrag(
        e,
        "x",
        (d) => {
          // the edge is on the sidebar's left: dragging left makes it wider
          last = clampSb(limits, base - d);
          applyWidth(last);
        },
        (moved) => {
          if (moved) saveSize(limits.key, last);
        },
      );
    },
    [applyWidth, sidebarRef, limits],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const r = resizeKey(e, "ArrowLeft", "ArrowRight");
      if (r == null) return;
      e.preventDefault();
      if (r === "reset") {
        resetWidth();
        return;
      }
      const w = clampSb(limits, (sidebarRef.current?.getBoundingClientRect().width ?? limits.def) + r);
      withoutTransitions(() => applyWidth(w));
      saveSize(limits.key, w);
    },
    [applyWidth, resetWidth, sidebarRef, limits],
  );

  return { edgeRef, onPointerDown, onKeyDown, resetWidth, syncEdgeValue, min: limits.min };
}

export type SidebarWidth = ReturnType<typeof useSidebarWidth>;

/** The line on the sidebar's left edge (11px hit area) with a grip in the middle (design .gutter--x);
 *  gold while hovered, focused or dragged. */
export function SidebarEdge({
  width,
  controls,
}: {
  width: SidebarWidth;
  /** id of the sidebar */
  controls?: string;
}) {
  return (
    <div
      ref={width.edgeRef}
      className="rx-sb-edge"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Resize the exchange and intelligence report panel"
      aria-controls={controls}
      aria-valuemin={width.min}
      title="Drag to resize · double-click to reset"
      onPointerDown={width.onPointerDown}
      onKeyDown={width.onKeyDown}
      onDoubleClick={width.resetWidth}
      onFocus={width.syncEdgeValue}
    />
  );
}

"use client";

/**
 * Desktop (>=1024px): drag the left edge of the RexScreener sidebar (Exchange + Intelligence report) to
 * resize it — prototype design/token.html #gSide + design/js/resize.js. Arrow keys too (Shift = bigger
 * steps), Home / double-click resets, the width is saved per viewer ("rx-size-tk-side-w").
 *
 * The width goes on the shell root as --rx-sb-w, which both the sidebar and the shrinking page column read
 * (src/app/globals.css). Same limits as the prediction-market pages
 * (rexmarkets/_components/RexMarketsReport/shared/PilotSidebarLayout.tsx): the page keeps at least 560px.
 * Styles: styles/pages/screener-side.css (.rx-screener .rx-sb-edge).
 */

import { useCallback, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import {
  loadSize,
  resizeKey,
  saveSize,
  startResizeDrag,
} from "@/app/rexmarkets/_components/RexMarketsReport/shared/dragResize";

const SB_KEY = "tk-side-w";
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

/**
 * `scopeRef`: the element that carries --rx-sb-w (the shell root). `sidebarRef`: the sidebar itself
 * (its rendered width is the starting point of a drag or a key step).
 */
export function useSidebarWidth(
  scopeRef: RefObject<HTMLElement | null>,
  sidebarRef: RefObject<HTMLElement | null>,
  /** false while the scope element is not rendered (the saved width applies once it is) */
  active = true,
) {
  const edgeRef = useRef<HTMLDivElement>(null);

  const syncEdgeValue = useCallback(() => {
    const sb = sidebarRef.current;
    const edge = edgeRef.current;
    if (!sb || !edge) return;
    edge.setAttribute("aria-valuenow", String(Math.round(sb.getBoundingClientRect().width)));
    edge.setAttribute("aria-valuemax", String(sbMax()));
  }, [sidebarRef]);

  /** Width in px, or null for the default (globals.css --rx-sb-w). */
  const applyWidth = useCallback(
    (w: number | null) => {
      const scope = scopeRef.current;
      if (!scope) return;
      if (w == null) scope.style.removeProperty("--rx-sb-w");
      else scope.style.setProperty("--rx-sb-w", sbWidthCss(w));
      syncEdgeValue();
    },
    [scopeRef, syncEdgeValue],
  );

  // The saved width applies before the first paint (no jump from the default)
  useLayoutEffect(() => {
    if (active) applyWidth(loadSize(SB_KEY));
  }, [active, applyWidth]);

  const resetWidth = useCallback(() => {
    withoutTransitions(() => applyWidth(null));
    saveSize(SB_KEY, null);
  }, [applyWidth]);

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
          last = clampSb(base - d);
          applyWidth(last);
        },
        (moved) => {
          if (moved) saveSize(SB_KEY, last);
        },
      );
    },
    [applyWidth, sidebarRef],
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
      const w = clampSb((sidebarRef.current?.getBoundingClientRect().width ?? SB_DEF) + r);
      withoutTransitions(() => applyWidth(w));
      saveSize(SB_KEY, w);
    },
    [applyWidth, resetWidth, sidebarRef],
  );

  return { edgeRef, onPointerDown, onKeyDown, resetWidth, syncEdgeValue };
}

export type SidebarWidth = ReturnType<typeof useSidebarWidth>;

/** The 1px line on the sidebar's left edge (11px hit area); gold while hovered, focused or dragged. */
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
      aria-valuemin={SB_MIN}
      title="Drag to resize · double-click to reset"
      onPointerDown={width.onPointerDown}
      onKeyDown={width.onKeyDown}
      onDoubleClick={width.resetWidth}
      onFocus={width.syncEdgeValue}
    />
  );
}

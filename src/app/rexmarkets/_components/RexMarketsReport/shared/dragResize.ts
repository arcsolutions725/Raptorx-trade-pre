"use client";

/**
 * Drag-to-resize helpers for the prediction-market page (prototype design/js/resize.js, RXResize):
 * pointer drag on a 1px separator line, arrow keys (Shift = bigger steps), Home / double-click to reset,
 * sizes saved per viewer in localStorage under the prototype's keys ("rx-size-<key>").
 */

import type { KeyboardEvent, PointerEvent } from "react";

const PREFIX = "rx-size-";

/** Saved size in px, or null (nothing saved / storage blocked). */
export function loadSize(key: string): number | null {
  try {
    const v = parseFloat(localStorage.getItem(PREFIX + key) ?? "");
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Save a size (null forgets it, so the default applies again). */
export function saveSize(key: string, v: number | null): void {
  try {
    if (v == null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, String(Math.round(v)));
  } catch {
    /* storage blocked: the size only lasts for this visit */
  }
}

/**
 * Start a pointer drag on a separator. `onDelta` gets the pointer travel in px along `axis` since the
 * drag started; `onEnd(moved)` runs once when it ends. While dragging, <body> gets `is-resizing`
 * (+ `is-resizing-x|y`) so transitions and text selection pause, and the handle gets `is-active`.
 */
export function startResizeDrag(
  e: PointerEvent<HTMLElement>,
  axis: "x" | "y",
  onDelta: (delta: number) => void,
  onEnd: (moved: boolean) => void,
): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const handle = e.currentTarget;
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    /* capture not available: the drag still follows pointermove on the handle */
  }
  const start = axis === "x" ? e.clientX : e.clientY;
  const body = document.body;
  let moved = false;
  let ended = false;
  body.classList.add("is-resizing", axis === "x" ? "is-resizing-x" : "is-resizing-y");
  handle.classList.add("is-active");

  const move = (ev: globalThis.PointerEvent) => {
    const d = (axis === "x" ? ev.clientX : ev.clientY) - start;
    if (d !== 0) moved = true;
    onDelta(d);
  };
  const up = () => {
    if (ended) return;
    ended = true;
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
    handle.removeEventListener("lostpointercapture", up);
    body.classList.remove("is-resizing", "is-resizing-x", "is-resizing-y");
    handle.classList.remove("is-active");
    onEnd(moved);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
  handle.addEventListener("lostpointercapture", up);
}

/**
 * Keyboard on a separator: `grow` / `shrink` are the arrow keys that make the panel bigger / smaller.
 * Returns the size change in px (16, or 64 with Shift), "reset" for Home, or null for other keys.
 */
export function resizeKey(
  e: KeyboardEvent<HTMLElement>,
  grow: string,
  shrink: string,
): number | "reset" | null {
  const step = e.shiftKey ? 64 : 16;
  if (e.key === grow) return step;
  if (e.key === shrink) return -step;
  if (e.key === "Home") return "reset";
  return null;
}

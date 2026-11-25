import type { CSSProperties } from "react";

/** Inline CSS custom properties, like the prototype's `style="--d:.2s"`. */
export const cssVars = (vars: Record<`--${string}`, string | number>): CSSProperties =>
  vars as CSSProperties;

/** Read once when an effect starts, as the prototype's scripts do. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

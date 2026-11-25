"use client";

import { preload } from "react-dom";

/** The prototype's <head> hints: the hero eye and the two text fonts start loading first. */
export default function LandingPreloads() {
  preload("/landing/eye.webp", {
    as: "image",
    imageSrcSet: "/landing/eye-sm.webp 360w, /landing/eye.webp 640w",
    imageSizes: "260px",
    fetchPriority: "high",
  });
  // Server only: React sends font preloads as an HTTP Link header, so a second call in the browser
  // would add a duplicate <link> that the page never uses (and Chrome warns about it).
  if (typeof window === "undefined") {
    preload("/fonts/archivo-variable.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
    preload("/fonts/instrument-sans-variable.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  return null;
}

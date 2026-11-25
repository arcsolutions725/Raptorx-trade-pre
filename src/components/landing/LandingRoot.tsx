"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "./motion";

/**
 * The landing wrapper (the prototype's `<body class="lp">`). Runs the page-wide parts of
 * design/js/landing.js: reveal-on-scroll and the primary-button ring.
 */
export default function LandingRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // fade content in as it reaches the viewport
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (prefersReducedMotion()) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // PRIMARY RING: only one primary button carries the circling border at a time.
  // A primary button in the page content wins while it is on screen (the most visible one if several);
  // when none is on screen, the header "Enter" takes the ring.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const header = root.querySelector<HTMLElement>(".lp-enter.js-ring");
    const inPage = Array.from(root.querySelectorAll<HTMLElement>(".js-ring")).filter((b) => b !== header);
    if (!header || !inPage.length) return;
    const all = [header, ...inPage];
    const ratio = new Map<Element, number>();
    const pick = () => {
      let best: HTMLElement | null = null;
      let bestR = 0;
      for (const b of inPage) {
        const r = ratio.get(b) || 0;
        if (r > bestR + 0.01) {
          best = b;
          bestR = r;
        }
      }
      const winner = best && bestR >= 0.5 ? best : header;
      all.forEach((b) => b.classList.toggle("is-ring", b === winner));
    };
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => ratio.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
        pick();
      },
      // ignore the strip under the fixed header
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-64px 0px 0px 0px" },
    );
    inPage.forEach((b) => io.observe(b));
    pick();
    return () => {
      io.disconnect();
      all.forEach((b) => b.classList.remove("is-ring"));
    };
  }, []);

  return (
    <div className="lp" ref={ref}>
      {children}
    </div>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "./motion";

/** The research → trade journey: the four cards run in sequence when the section comes into view. */
export default function FlowTrack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const jr = ref.current;
    if (!jr) return;
    if (prefersReducedMotion()) {
      jr.classList.add("is-run");
      return;
    }
    const io = new IntersectionObserver(
      (es, o) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            jr.classList.add("is-run");
            o.disconnect();
          }
        }),
      { threshold: 0.3 },
    );
    io.observe(jr);
    return () => io.disconnect();
  }, []);

  return (
    <ol className="jr" aria-label="One trade on RaptorX, start to finish" ref={ref}>
      {children}
    </ol>
  );
}

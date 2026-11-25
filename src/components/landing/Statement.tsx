"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

export default function Statement() {
  const ref = useRef<HTMLParagraphElement>(null);

  // each line lights up as it passes the middle of the screen
  useEffect(() => {
    const text = ref.current;
    if (!text || prefersReducedMotion()) return;
    const lines = Array.from(text.querySelectorAll<HTMLElement>("span"));
    const lightUp = () => {
      const mid = window.innerHeight * 0.62;
      lines.forEach((l) => l.classList.toggle("is-lit", l.getBoundingClientRect().top < mid));
    };
    window.addEventListener("scroll", lightUp, { passive: true });
    lightUp();
    return () => window.removeEventListener("scroll", lightUp);
  }, []);

  return (
    <section className="statement" aria-label="Why RaptorX exists">
      <p className="statement__text" ref={ref}>
        <span>Markets are loud.</span> <span>The edge is quiet.</span> <span>RaptorX finds it.</span>
      </p>
    </section>
  );
}

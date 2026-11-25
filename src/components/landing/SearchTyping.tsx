"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

const WORDS = ["aer", "0x9401…a3f", "fed cut", "trump 2028"];

/** The ⌘K box in the features bento types and deletes a few searches on a loop. */
export default function SearchTyping() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = "aer";
      return;
    }
    let w = 0;
    let n = 0;
    let dir = 1;
    let timer = 0;
    const loop = () => {
      const s = WORDS[w];
      n += dir;
      el.textContent = s.slice(0, n);
      let d = dir > 0 ? 110 : 45;
      if (n === s.length) {
        dir = -1;
        d = 1600;
      }
      if (n === 0 && dir < 0) {
        dir = 1;
        w = (w + 1) % WORDS.length;
        d = 400;
      }
      timer = window.setTimeout(loop, d);
    };
    timer = window.setTimeout(loop, 800);
    return () => {
      window.clearTimeout(timer);
      el.textContent = "";
    };
  }, []);

  return <span data-mk="type" ref={ref} />;
}

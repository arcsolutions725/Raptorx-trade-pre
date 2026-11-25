"use client";

import type { PointerEvent, ReactNode } from "react";

/** The features bento: each card's glow follows the cursor (--mx / --my on the hovered .bx). */
export default function Bento({ children }: { children: ReactNode }) {
  const onPointerMove = (e: PointerEvent<HTMLUListElement>) => {
    const bx = (e.target as Element).closest<HTMLElement>(".bx");
    if (!bx || !e.currentTarget.contains(bx)) return;
    const r = bx.getBoundingClientRect();
    bx.style.setProperty("--mx", e.clientX - r.left + "px");
    bx.style.setProperty("--my", e.clientY - r.top + "px");
  };

  return (
    <ul className="bento" onPointerMove={onPointerMove}>
      {children}
    </ul>
  );
}

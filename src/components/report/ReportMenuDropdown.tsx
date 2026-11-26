"use client";

import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { displayReportSectionTitle } from "@/lib/reportToc";
import "@/styles/pages/analytics.css";

/* "Jump to a section" (prototype .sec-nav + .menu): round gold button, menu portalled to <body>.
   Styles: styles/pages/analytics.css (.an-nav__*); the portal carries its own .rx-an root. */

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const WRAPPER_PANEL =
  "pointer-events-none absolute bottom-28 right-[max(1rem,env(safe-area-inset-right,0px))] z-[80] sm:right-[max(2rem,env(safe-area-inset-right,0px))]";
const WRAPPER_EMBED =
  "pointer-events-none sticky top-2 z-[80] mt-1 mb-2 flex w-full justify-end pr-0 sm:top-3 sm:pr-1";

export type ReportMenuDropdownLayout = "panel" | "embed";

export function ReportMenuDropdown({
  items,
  scrollRootRef,
  layout = "panel",
}: {
  items: { title: string; id: string }[];
  scrollRootRef: React.RefObject<HTMLElement | null>;
  layout?: ReportMenuDropdownLayout;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => items[0]?.id ?? null);
  const [menuEntered, setMenuEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setActiveId((prev) => {
      if (prev && items.some((i) => i.id === prev)) return prev;
      return items[0]?.id ?? null;
    });
  }, [items]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuEntered(false);
      return;
    }
    setMenuEntered(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setMenuEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || items.length === 0) return;
    const root = scrollRootRef.current;
    const ids = items.map((i) => i.id);
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n !== null);
    if (els.length === 0) return;

    const scores = new Map<string, number>();
    const thresholdSteps = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1];

    const pickActive = () => {
      let bestId = ids[0];
      let best = -1;
      for (const id of ids) {
        const s = scores.get(id) ?? 0;
        if (s > best) {
          best = s;
          bestId = id;
        }
      }
      setActiveId(bestId);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          scores.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        pickActive();
      },
      {
        root: root ?? undefined,
        rootMargin: "-14% 0px -38% 0px",
        threshold: thresholdSteps,
      },
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [open, items, scrollRootRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const btn = buttonRef.current;
      const panel = panelRef.current;
      if (!btn) return;

      const r = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;
      const menuHeight =
        panel?.getBoundingClientRect().height ||
        Math.min(260, items.length * 44 + 88);

      const spaceBelow = vh - r.bottom - margin;
      const spaceAbove = r.top - margin;
      const openUp =
        spaceBelow < Math.min(menuHeight, 220) && spaceAbove > spaceBelow;

      let top = openUp ? r.top - margin - menuHeight : r.bottom + margin;
      if (top < margin) top = margin;
      if (top + menuHeight > vh - margin)
        top = Math.max(margin, vh - margin - menuHeight);

      const right = vw - r.right;
      setMenuStyle({
        position: "fixed",
        top,
        right: Math.max(margin, right),
        maxHeight: "min(16rem, calc(100vh - 6rem))",
      });
    };

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, items.length]);

  if (items.length === 0) return null;

  const wrapperClass = layout === "embed" ? WRAPPER_EMBED : WRAPPER_PANEL;

  return (
    <div ref={rootRef} className={`rx-an ${wrapperClass}`}>
      <div className="pointer-events-auto relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rx-icon-btn an-nav__btn"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Jump to a report section"
          title="Jump to a section"
        >
          <MenuIcon />
        </button>
        {open &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={panelRef}
              style={menuStyle}
              className={`rx-an an-nav__menu${menuEntered ? " is-in" : ""}`}
            >
              <span className="rx-eyebrow an-nav__head">Jump to a section</span>
              <ul
                role="listbox"
                className="an-nav__list"
                aria-label="Report sections"
              >
                {items.map((it) => {
                  const isActive = activeId === it.id;
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className="an-nav__item"
                        onClick={() => {
                          document.getElementById(it.id)?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                          setOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          {displayReportSectionTitle(it.title)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

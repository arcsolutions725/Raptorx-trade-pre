"use client";

import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronRight, List } from "lucide-react";
import { displayReportSectionTitle } from "@/lib/reportToc";

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
    <div ref={rootRef} className={wrapperClass}>
      <div className="pointer-events-auto relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="group inline-flex items-center justify-center rounded-full border border-[#ffc000]/55 bg-gradient-to-br from-[#1f1f1f] via-[#141414] to-[#0a0a0a] p-3 text-[#ffc000] shadow-[0_4px_24px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,192,0,0.12)_inset,0_0_28px_rgba(255,192,0,0.12)] transition-all duration-300 hover:border-[#ffc000]/85 hover:shadow-[0_8px_32px_rgba(0,0,0,0.55),0_0_40px_rgba(255,192,0,0.2)] hover:scale-[1.04] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc000]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Jump to a report section"
          title="Jump to a section"
        >
          <List className="h-6 w-6 shrink-0 transition-transform duration-300 group-hover:scale-110" />
        </button>
        {open &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={panelRef}
              style={menuStyle}
              className={`z-[200] w-[min(90vw,300px)] origin-bottom-right motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] ${
                menuEntered
                  ? "opacity-100 translate-y-0 scale-100"
                  : "opacity-0 translate-y-2 scale-[0.96]"
              }`}
            >
              <div className="rounded-2xl bg-gradient-to-br from-[#ffc000]/50 via-[#ffc000]/12 to-white/[0.07] p-px shadow-[0_28px_56px_rgba(0,0,0,0.65),0_0_1px_rgba(255,192,0,0.35)]">
                <div className="flex max-h-[min(16rem,calc(100vh-6rem))] min-h-0 flex-col overflow-hidden rounded-[15px] border border-white/[0.06] bg-gradient-to-b from-[#161616]/92 to-[#070707]/96 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-2xl backdrop-saturate-150 antialiased [font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif]">
                  <div className="shrink-0 border-b border-white/[0.06] bg-black/25 px-3.5 py-3.5">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 self-start">
                        <Image
                          src="/images/raptorx.png"
                          alt="RaptorX"
                          width={112}
                          height={40}
                          className="h-9 w-auto max-w-[5.5rem] object-contain object-left"
                        />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-[15px] font-semibold leading-tight tracking-[-0.02em] text-[#f0cf7a] sm:text-base">
                          Navigation
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-white/60 sm:text-[13px]">
                          Jump to any section of your analysis
                        </p>
                      </div>
                    </div>
                  </div>
                  <ul
                    role="listbox"
                    className="rexmarkets-scroll-pane-y max-h-[min(10rem,calc(100vh-14rem))] min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2.5"
                    aria-label="Report sections"
                  >
                    {items.map((it) => {
                      const isActive = activeId === it.id;
                      return (
                        <li key={it.id} className="px-0.5 py-0.5">
                          <button
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            className={`group/item relative flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] leading-snug transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc000]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0a0a0a] sm:py-2.5 sm:text-[13px] ${
                              isActive
                                ? "bg-gradient-to-r from-[#ffc000] to-[#e6ac00] font-semibold text-black shadow-[0_8px_24px_rgba(255,192,0,0.25)] [letter-spacing:-0.01em]"
                                : "font-medium text-white/[0.88] [letter-spacing:-0.01em] hover:bg-white/[0.07] hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                            }`}
                            onClick={() => {
                              document.getElementById(it.id)?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                              setOpen(false);
                            }}
                          >
                            <ChevronRight
                              className={`mt-0.5 h-4 w-4 shrink-0 transition-all duration-200 ${
                                isActive
                                  ? "text-black opacity-90"
                                  : "text-[#ffc000]/0 group-hover/item:text-[#f0cf7a] group-hover/item:translate-x-0.5"
                              }`}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              {displayReportSectionTitle(it.title)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

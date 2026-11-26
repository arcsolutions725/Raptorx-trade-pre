"use client";

/**
 * Pieces of the RexScreener sidebar (prototype design/token.html aside.tk-side): pane heads,
 * icons, and the report's "Jump to a section" menu. Built on the market sidebar's pilotUi so
 * both sidebars share the same heads, claw mark, ask bar and Q&A thread.
 * Styles: styles/pages/pilot.css (.rx-pilot) + styles/pages/screener-side.css (.rx-ss).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ClawMark,
  IconBack,
  IconMin,
  IconX,
} from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/pilotUi";
import { PilotReportHistoryButton } from "./PilotReportHistoryButton";

type IconProps = { size?: number };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconSwap({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7h12l-3-3M17 17H5l3 3" {...stroke} strokeWidth="2" />
    </svg>
  );
}

export function IconRefresh({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 10-2 6M20 4v7h-7" {...stroke} strokeWidth="2" />
    </svg>
  );
}

export function IconShare({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5" {...stroke} strokeWidth="2" />
    </svg>
  );
}

export function IconCopy({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 9h11v11H9zM5 15H4V4h11v1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCheck({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l5 5 9-10" {...stroke} strokeWidth="2.6" />
    </svg>
  );
}

/** Gold bolt used on every What's New button (prototype i-news). */
export function IconNews({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M13.6 1.8 4.3 13.4c-.3.4 0 .9.5.9h5.6l-1.3 7.6c-.1.6.6.9 1 .5l9.4-11.7c.3-.4 0-.9-.5-.9h-5.6l1.2-7.5c.1-.6-.6-.9-1-.5Z"
        fill="#FFD15C"
        stroke="#B87400"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconMenu({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h10" {...stroke} strokeWidth="2" />
    </svg>
  );
}

export function IconExt({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17L17 7M9 7h8v8" {...stroke} strokeWidth="2.4" />
    </svg>
  );
}

export function IconTrend({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8M15 7h6v6" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

export function IconInfo({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v6M12 7.5v.5" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

/** Exchange mark: dark ember tile with the swap arrows (prototype #exchange-panel head). */
export function SwapMark({ size = 13 }: IconProps) {
  return (
    <span className="sb-mark ss-mark--swap" aria-hidden="true">
      <IconSwap size={size} />
    </span>
  );
}

type ReportPaneHeadProps = {
  /** Back to the Generate / chart view (only while a saved report is open). */
  onBack?: () => void;
  /** Opens the Report history drawer. */
  onHistory?: () => void;
  historyCount?: number;
  /** Minimize the report so the Exchange gets the column. */
  onMinimize?: () => void;
  /** Close the whole sidebar (only when no other pane shows a close). */
  onClose?: () => void;
};

/** Intelligence report pane head (prototype #report .panel__head). */
export function ReportPaneHead({
  onBack,
  onHistory,
  historyCount = 0,
  onMinimize,
  onClose,
}: ReportPaneHeadProps) {
  return (
    <div className="sb-head">
      {onBack ? (
        <button
          type="button"
          className="rx-icon-btn panel-ctl"
          onClick={onBack}
          aria-label="Back to Generate Report"
          title="Back"
        >
          <IconBack />
        </button>
      ) : null}
      <ClawMark size={17} />
      <div className="panel__title">
        <b>
          <span className="t">Intelligence report</span>
        </b>
        <span className="panel__sub">Rex Pilot · your AI pilot for everything crypto</span>
      </div>
      {onHistory || onMinimize || onClose ? (
        <div className="sb-head__tools">
          {onHistory ? (
            <>
              <PilotReportHistoryButton
                count={historyCount}
                onOpen={onHistory}
                className="ss-hist ss-hist--wide"
              />
              <PilotReportHistoryButton
                variant="icon"
                count={historyCount}
                onOpen={onHistory}
                className="ss-hist ss-hist--narrow"
              />
            </>
          ) : null}
          {onMinimize ? (
            <button
              type="button"
              className="rx-icon-btn panel-ctl"
              onClick={onMinimize}
              aria-expanded="true"
              aria-label="Minimize intelligence report"
              title="Minimize"
            >
              <IconMin />
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="rx-icon-btn panel-ctl"
              onClick={onClose}
              aria-label="Close sidebar"
              title="Close"
            >
              <IconX />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type SectionNavItem = { id: string; title: string };

/**
 * "Jump to a section" (prototype .sec-nav): a round gold button over the bottom-right of the
 * report that opens a menu of the report's sections. Positioned against the report pane.
 */
export function SectionNav({
  items,
  scrollRootRef,
}: {
  items: SectionNavItem[];
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  /** The section whose heading sits closest above the top third of the scroll area. */
  const findActive = useCallback(() => {
    const root = scrollRootRef.current;
    if (!root || !items.length) return items[0]?.id ?? null;
    const line = root.getBoundingClientRect().top + root.clientHeight * 0.3;
    let best = items[0].id;
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= line) best = it.id;
    }
    return best;
  }, [items, scrollRootRef]);

  const close = useCallback((focusBtn = false) => {
    setOpen(false);
    if (focusBtn) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveId(findActive());
    const t = window.setTimeout(() => {
      const cur =
        menuRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]') ??
        menuRef.current?.querySelector<HTMLButtonElement>("button");
      cur?.focus({ preventScroll: true });
      cur?.scrollIntoView({ block: "nearest" });
    }, 0);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, findActive, close]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="rx-icon-btn ss-nav__btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Jump to a report section"
        title="Jump to a section"
      >
        <IconMenu />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          className="ss-nav__menu"
          role="menu"
          aria-label="Report sections"
          onKeyDown={(e) => {
            const list = Array.from(
              menuRef.current?.querySelectorAll<HTMLButtonElement>(".ss-nav__item") ?? [],
            );
            if (!list.length) return;
            const i = list.indexOf(document.activeElement as HTMLButtonElement);
            let next = -1;
            if (e.key === "ArrowDown") next = (i + 1) % list.length;
            else if (e.key === "ArrowUp") next = (i - 1 + list.length) % list.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = list.length - 1;
            else if (e.key === "Tab") setOpen(false);
            if (next < 0) return;
            e.preventDefault();
            list[next].focus();
          }}
        >
          <span className="rx-eyebrow">Jump to a section</span>
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              className="ss-nav__item"
              aria-current={activeId === it.id ? "true" : undefined}
              onClick={() => {
                const reduce =
                  typeof window !== "undefined" &&
                  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                document.getElementById(it.id)?.scrollIntoView({
                  behavior: reduce ? "auto" : "smooth",
                  block: "start",
                });
                close(true);
              }}
            >
              {it.title}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

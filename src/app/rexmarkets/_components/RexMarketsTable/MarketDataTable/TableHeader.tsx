import React from "react";
import clsx from "clsx";

/** Column grid shared by the header, the rows and the loading rows (phones pin a narrower first column). */
export const REX_TABLE_GRID =
  "[grid-template-columns:minmax(190px,2.8fr)_minmax(76px,1fr)_minmax(76px,1fr)_minmax(150px,1.15fr)_minmax(82px,1fr)_minmax(82px,1fr)_minmax(96px,1fr)] sm:[grid-template-columns:minmax(300px,3fr)_minmax(88px,1fr)_minmax(88px,1fr)_minmax(156px,1.15fr)_minmax(92px,1fr)_minmax(92px,1fr)_minmax(104px,1fr)]";

export const REX_TABLE_GRID_WITH_SOURCE =
  "[grid-template-columns:minmax(190px,2.8fr)_minmax(76px,1fr)_minmax(76px,1fr)_minmax(150px,1.15fr)_minmax(82px,1fr)_minmax(82px,1fr)_minmax(96px,1fr)_minmax(100px,1fr)] sm:[grid-template-columns:minmax(300px,3fr)_minmax(88px,1fr)_minmax(88px,1fr)_minmax(156px,1.15fr)_minmax(92px,1fr)_minmax(92px,1fr)_minmax(104px,1fr)_minmax(100px,1fr)]";

/** Sum of the grid's minimum tracks. Rows must be at least this wide so the pinned cell
    (sticky, clamped to its row box) stays put across the whole horizontal scroll. */
export const REX_TABLE_MIN_W = "min-w-[752px] sm:min-w-[920px]";

/** Pinned first column: solid ground so scrolled cells pass underneath; hairline on phones like the prototype. */
export const REX_TABLE_PIN =
  "sticky left-0 bg-[#0C0C0C] max-md:shadow-[inset_-1px_0_0_var(--rx-line),10px_0_14px_-12px_rgba(0,0,0,.9)]";

const TH =
  "flex items-center justify-end whitespace-nowrap px-2.5 py-3.5 font-mono text-[11px] font-medium uppercase tracking-[.08em] text-rx-text-3";

type TableHeaderProps = {
  showSourceColumn?: boolean;
};

export default function TableHeader({ showSourceColumn = false }: TableHeaderProps) {
  return (
    <div
      className={clsx(
        "grid border-b border-rx-line",
        showSourceColumn ? REX_TABLE_GRID_WITH_SOURCE : REX_TABLE_GRID,
      )}
    >
      {/* Market: the header row is moved by transform, so it is pinned by counter-translating
          with --rx-hx (set by MarketDataTable from the horizontal scroll position). */}
      <div
        className={clsx(TH, REX_TABLE_PIN, "z-[2] justify-start pl-3 sm:pl-1")}
        style={{ transform: "translateX(var(--rx-hx, 0px))" }}
        title="Click a market for live insights"
      >
        Market
      </div>
      <div className={TH}>Choice I</div>
      <div className={TH}>Choice II</div>
      <div className={TH}>AI report</div>
      <div className={TH}>Yes price</div>
      <div className={TH}>No price</div>
      <div className={clsx(TH, !showSourceColumn && "pr-3 sm:pr-1")}>Vol 24h</div>
      {showSourceColumn && <div className={clsx(TH, "pr-3 sm:pr-1")}>Source</div>}
    </div>
  );
}

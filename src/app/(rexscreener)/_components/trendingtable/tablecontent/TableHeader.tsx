import clsx from "clsx";
import {
  SCREENER_GRID_COLS,
  SCREENER_ORDER,
  SCREENER_ROW_MIN_W,
} from "./gridColumns";
import type { SortField, SortDirection } from "@/hooks/useTrendingTokens";
import type { ScreenerFrame } from "@/lib/screenerFrames";

export type { SortField, SortDirection };

interface TableHeaderProps {
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  /** The list's timeframe (design #frames): labels the change column. Default 24h. */
  frame?: ScreenerFrame;
}

/** Column label: mono, uppercase, quiet (RaptorX table header). */
const TH =
  "flex items-center whitespace-nowrap px-2.5 py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-rx-text-3";

/**
 * The header row sits outside the horizontal scroller and follows it with a transform,
 * so its pinned cells undo that transform (--rx-hscroll) to stay over the pinned row cells.
 * Tablets (768–1199px) pin nothing, so the header cells scroll with the rest there.
 */
const TH_PINNED =
  "relative z-[2] self-stretch translate-x-[var(--rx-hscroll,0px)] bg-[var(--rx-pin-head-bg,transparent)] md:max-[1200px]:translate-x-0 md:max-[1200px]:bg-transparent md:max-[1200px]:shadow-none";

function SortIcon({ dir }: { dir: SortDirection | "none" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={dir === "none" ? "opacity-50" : undefined}
    >
      <path
        d={
          dir === "asc"
            ? "M8 14l4-4 4 4"
            : dir === "desc"
              ? "M8 10l4 4 4-4"
              : "M8 9l4-4 4 4M8 15l4 4 4-4"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TableHeader({
  sortField,
  sortDirection,
  onSort,
  frame = "24h",
}: TableHeaderProps) {
  /** The sorted column's header cell carries the direction (the design puts aria-sort on the th;
   *  this grid has no table roles, so the sort buttons' labels announce it instead). */
  const sortedDir = (field: SortField) =>
    sortField === field && sortDirection !== null
      ? sortDirection === "asc"
        ? ("ascending" as const)
        : ("descending" as const)
      : undefined;

  const sortButton = (field: SortField, label: string) => {
    const active = sortField === field && sortDirection !== null;
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        title={`Sort by ${label}`}
        aria-label={`Sort by ${label}${
          active ? (sortDirection === "asc" ? ", ascending" : ", descending") : ""
        }`}
        className={clsx(
          "-mx-1.5 -my-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-2 uppercase tracking-[0.08em] transition-colors hover:text-rx-text focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-rx-gold-hi",
          active && "text-rx-gold-hi hover:text-rx-gold-hi",
        )}
      >
        {label}
        <SortIcon dir={active ? sortDirection : "none"} />
      </button>
    );
  };

  return (
    <div
      className={clsx(
        "grid w-full border-b border-rx-line",
        SCREENER_GRID_COLS,
        SCREENER_ROW_MIN_W,
      )}
    >
      <div className={clsx(TH, TH_PINNED, "pl-1 pr-1 max-md:hidden")}>
        #
      </div>

      <div
        className={clsx(
          TH,
          TH_PINNED,
          SCREENER_ORDER.token,
          "shadow-[var(--rx-pin-shadow,none)] max-md:pl-3.5",
        )}
        title="Click a token to open its chart"
      >
        Token
      </div>

      <div className={clsx(TH, SCREENER_ORDER.ai, "px-2")}>
        AI reports
      </div>

      <div
        data-sorted={sortedDir("marketCap")}
        className={clsx(TH, SCREENER_ORDER.mcap, "justify-end")}
      >
        {sortButton("marketCap", "Mcap")}
      </div>

      <div
        data-sorted={sortedDir("change")}
        className={clsx(TH, SCREENER_ORDER.chg, "justify-end")}
      >
        {sortButton("change", frame)}
      </div>

      <div className={clsx(TH, SCREENER_ORDER.trend, "justify-end")}>
        <span className="sr-only">24h trend (hourly line from Birdeye)</span>
      </div>

      <div
        data-sorted={sortedDir("price")}
        className={clsx(TH, SCREENER_ORDER.price, "justify-end")}
      >
        {sortButton("price", "Price")}
      </div>

      <div
        data-sorted={sortedDir("volume")}
        className={clsx(TH, SCREENER_ORDER.volume, "justify-end")}
      >
        {sortButton("volume", "Volume")}
      </div>

      <div
        data-sorted={sortedDir("liquidity")}
        className={clsx(TH, SCREENER_ORDER.liquidity, "justify-end")}
      >
        {sortButton("liquidity", "Liquidity")}
      </div>

      {/* Age is not sortable (design/screener.html) */}
      <div className={clsx(TH, SCREENER_ORDER.age, "justify-end pr-3.5 md:pr-1")}>
        Age
      </div>
    </div>
  );
}

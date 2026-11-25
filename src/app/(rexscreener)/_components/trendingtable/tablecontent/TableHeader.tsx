import clsx from "clsx";
import {
  SCREENER_GRID_COLS,
  SCREENER_ROW_MIN_W,
} from "./gridColumns";

// ⬅️ Add "liquidity"
export type SortField = "marketCap" | "volume" | "price" | "age" | "liquidity";
export type SortDirection = "asc" | "desc" | null;

interface TableHeaderProps {
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

/** Column label: mono, uppercase, quiet (RaptorX table header). */
const TH =
  "flex items-center whitespace-nowrap px-2.5 py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-rx-text-3";

/**
 * The header row sits outside the horizontal scroller and follows it with a transform,
 * so its pinned cells undo that transform (--rx-hscroll) to stay over the pinned row cells.
 */
const TH_PINNED =
  "relative z-[2] self-stretch translate-x-[var(--rx-hscroll,0px)] bg-[var(--rx-pin-head-bg,transparent)]";

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
}: TableHeaderProps) {
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
          "-mx-1.5 -my-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 uppercase tracking-[0.08em] transition-colors hover:text-rx-text",
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
      <div className={clsx(TH, TH_PINNED, "pl-3 pr-1 sm:pl-1")}>#</div>

      <div
        className={clsx(
          TH,
          TH_PINNED,
          "shadow-[var(--rx-pin-shadow,none)]",
        )}
        title="Click a token to open its chart"
      >
        Token
      </div>

      <div className={clsx(TH, "px-2")}>AI reports</div>

      <div className={clsx(TH, "justify-end")}>
        {sortButton("marketCap", "Mcap")}
      </div>

      <div
        className={clsx(TH, "justify-end")}
        title="24h price change (USD)"
      >
        24h
      </div>

      <div className={clsx(TH, "justify-end")}>
        <span className="sr-only">24h trend (hourly line from Birdeye)</span>
      </div>

      <div className={clsx(TH, "justify-end")}>
        {sortButton("price", "Price")}
      </div>

      <div className={clsx(TH, "justify-end")}>
        {sortButton("volume", "Volume")}
      </div>

      <div className={clsx(TH, "justify-end")}>
        {sortButton("liquidity", "Liquidity")}
      </div>

      <div className={clsx(TH, "justify-end pr-3 sm:pr-1")}>
        {sortButton("age", "Age")}
      </div>
    </div>
  );
}

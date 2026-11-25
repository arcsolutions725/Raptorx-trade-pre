/**
 * Shared column layout for the RexScreener token table (header + rows must match).
 * Columns: # · Token · AI reports · Mcap · 24h · Trend · Price · Volume · Liquidity · Age
 */
export const SCREENER_GRID_COLS =
  "grid-cols-[40px_minmax(236px,1.5fr)_236px_minmax(88px,0.8fr)_minmax(86px,0.7fr)_84px_minmax(88px,0.8fr)_minmax(96px,0.9fr)_minmax(88px,0.8fr)_minmax(52px,0.5fr)] sm:grid-cols-[44px_minmax(240px,2.2fr)_248px_minmax(100px,0.9fr)_minmax(92px,0.7fr)_minmax(88px,0.6fr)_minmax(100px,0.9fr)_minmax(108px,0.9fr)_minmax(100px,0.9fr)_minmax(56px,0.5fr)]";

/** Sum of the column minimums above; below this the table scrolls sideways. */
export const SCREENER_ROW_MIN_W = "min-w-[1094px] sm:min-w-[1176px]";

/**
 * Rank + token stay pinned while the table scrolls sideways (phones, or desktop with the
 * report sidebar open). The pinned background only turns opaque when the table actually
 * overflows: the frame sets --rx-pin-bg / --rx-pin-shadow (see tablecontent/index.tsx).
 */
export const SCREENER_PIN_RANK =
  "sticky left-0 z-[2] self-stretch bg-[var(--rx-pin-bg,transparent)] group-hover:bg-[var(--rx-pin-bg-hover,transparent)]";
export const SCREENER_PIN_TOKEN =
  "sticky left-[40px] sm:left-[44px] z-[2] self-stretch bg-[var(--rx-pin-bg,transparent)] shadow-[var(--rx-pin-shadow,none)] group-hover:bg-[var(--rx-pin-bg-hover,transparent)]";

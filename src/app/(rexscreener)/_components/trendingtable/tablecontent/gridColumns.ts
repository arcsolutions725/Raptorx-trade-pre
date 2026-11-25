/**
 * Shared column layout for the RexScreener token table (header + rows must match).
 * Columns (DOM order): # · Token · AI reports · Mcap · 24h · Trend · Price · Volume · Liquidity · Age
 *
 * Phones (< 768px): the list still scrolls sideways, but the key numbers come first:
 * Token · Price · 24h · AI reports · the rest (CSS `order`), the rank column is hidden and only a
 * slim token column (logo + ticker, 112px) stays pinned, flush to the screen edge.
 */
export const SCREENER_GRID_COLS =
  "grid-cols-[112px_minmax(84px,1fr)_minmax(84px,1fr)_236px_88px_84px_96px_88px_56px] md:grid-cols-[44px_minmax(240px,2.2fr)_248px_minmax(100px,0.9fr)_minmax(92px,0.7fr)_minmax(88px,0.6fr)_minmax(100px,0.9fr)_minmax(108px,0.9fr)_minmax(100px,0.9fr)_minmax(56px,0.5fr)]";

/** Sum of the column minimums above; below this the table scrolls sideways. */
export const SCREENER_ROW_MIN_W = "min-w-[944px] md:min-w-[1176px]";

/** Phone column order (desktop keeps the DOM order). */
export const SCREENER_ORDER = {
  token: "max-md:order-1",
  price: "max-md:order-2",
  chg: "max-md:order-3",
  ai: "max-md:order-4",
  mcap: "max-md:order-5",
  trend: "max-md:order-6",
  volume: "max-md:order-7",
  liquidity: "max-md:order-8",
  age: "max-md:order-9",
} as const;

/**
 * Pinned columns while the table scrolls sideways: rank + token on desktop (e.g. with the report
 * sidebar open), only the slim token column on phones, nothing on tablets (768–1199px), where the
 * list scrolls as one piece so every column gets its full width. The pinned background only turns
 * opaque when the table actually overflows: the frame sets --rx-pin-bg / --rx-pin-shadow
 * (see tablecontent/index.tsx).
 */
export const SCREENER_PIN_RANK =
  "max-md:hidden md:sticky md:left-0 z-[2] self-stretch bg-[var(--rx-pin-bg,transparent)] group-hover:bg-[var(--rx-pin-bg-hover,transparent)] md:max-[1200px]:static md:max-[1200px]:bg-transparent md:max-[1200px]:group-hover:bg-transparent";
export const SCREENER_PIN_TOKEN =
  "sticky left-0 md:left-[44px] z-[2] self-stretch bg-[var(--rx-pin-bg,transparent)] shadow-[var(--rx-pin-shadow,none)] group-hover:bg-[var(--rx-pin-bg-hover,transparent)] md:max-[1200px]:static md:max-[1200px]:bg-transparent md:max-[1200px]:group-hover:bg-transparent md:max-[1200px]:shadow-none";

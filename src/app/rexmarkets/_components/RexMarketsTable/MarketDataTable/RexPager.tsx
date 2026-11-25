"use client";

/**
 * Rex Predictions pager (prototype "shared pagination", .pgr):
 * "Show N per page" on the left, Previous · 1 2 3 … N · Next on the right.
 * Phones: the size picker gets its own centred row, then Previous · "Page X of N" · Next.
 * Hidden when everything fits on one page.
 *
 * Cursor-paged venues (Kalshi, Predict.fun, the merged "All" list) can only open pages that were
 * already visited, plus the next one. Their known page count is shown as a muted label, not a button.
 */

import clsx from "clsx";
import { ChevronIcon } from "./listUi";

type Slot = number | "gap";

/** 7 slots at most: first and last always, the current page with its neighbours, "…" for gaps. */
function pageSlots(cur: number, last: number): Slot[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, "gap", last];
  if (cur >= last - 3) return [1, "gap", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "gap", cur - 1, cur, cur + 1, "gap", last];
}

export type RexPagerProps = {
  page: number;
  /** Page count when the venue reports a total. */
  totalPages?: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** Any page can be opened directly (offset / page-number APIs). */
  randomAccess: boolean;
  onPage: (page: number) => void;
  size: number;
  sizes: readonly number[];
  onSize: (size: number) => void;
  /** More rows exist than the smallest size, so the size picker is worth showing. */
  showSize: boolean;
  /** A page is loading: clicks are ignored so cursor pages cannot get out of step. */
  busy?: boolean;
  label?: string;
};

const fmt = (n: number) => n.toLocaleString("en-US");

export default function RexPager({
  page,
  totalPages,
  hasPrev,
  hasNext,
  randomAccess,
  onPage,
  size,
  sizes,
  onSize,
  showSize,
  busy = false,
  label = "Rex Predictions pages",
}: RexPagerProps) {
  const cur = Math.max(1, page);
  const total = totalPages && totalPages > 0 ? Math.max(totalPages, cur) : undefined;
  // Highest page a click can open right now
  const jumpMax = randomAccess && total ? total : cur + (hasNext ? 1 : 0);
  const canPrev = hasPrev || cur > 1;
  const canNext = hasNext;
  const showNav = canPrev || canNext || (total ?? 1) > 1;
  const sizePicker = showSize && sizes.length > 1;

  if (!showNav && !sizePicker) return null;

  const go = (n: number) => {
    if (busy || n < 1 || n === cur || n > jumpMax) return;
    onPage(n);
  };

  const slots = pageSlots(cur, Math.max(cur, jumpMax));
  const tail = total && total > jumpMax ? total : null;

  const numClass =
    "rx-num h-9 min-w-9 rounded-[10px] border px-2 text-[14px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi";
  const stepClass =
    "rx-btn rx-btn--secondary rx-btn--s gap-1.5 max-md:h-10 max-md:px-3.5";

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-1 max-md:justify-center"
      aria-label={label}
      aria-busy={busy || undefined}
    >
      {sizePicker ? (
        <div className="inline-flex items-center gap-2.5 text-[14px] text-rx-text-3 max-md:w-full max-md:justify-center">
          Show
          {/* font-mono sits on the wrapper: the global `select { font-family: inherit }` rule outranks utilities */}
          <div className="relative inline-flex items-center font-mono">
            <select
              value={size}
              onChange={(e) => onSize(Number(e.target.value))}
              aria-label="Rows per page"
              className="rx-num h-9 cursor-pointer appearance-none rounded-[10px] border border-rx-line-strong bg-rx-surface-2 pl-3 pr-8 text-[14px] font-semibold text-rx-text outline-none transition-colors hover:border-[#4a4948] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi"
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2.5 flex text-rx-text-3">
              <ChevronIcon direction="down" size={12} />
            </div>
          </div>
          per page
        </div>
      ) : (
        <div aria-hidden />
      )}

      {showNav ? (
        <div className="ml-auto flex items-center gap-1.5 max-md:mx-auto max-md:w-full max-md:justify-between">
          <button
            type="button"
            className={stepClass}
            onClick={() => go(cur - 1)}
            disabled={!canPrev}
            aria-label="Previous page"
          >
            <ChevronIcon direction="left" />
            Previous
          </button>

          {/* page buttons inherit the mono face from the list (buttons are forced to font-family: inherit) */}
          <ol className="m-0 mx-1 flex list-none items-center gap-1 p-0 font-mono max-md:hidden">
            {slots.map((n, i) =>
              n === "gap" ? (
                <li
                  key={`gap-${i}`}
                  className="min-w-5 text-center text-rx-text-3"
                  aria-hidden
                >
                  …
                </li>
              ) : (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => go(n)}
                    aria-current={n === cur ? "page" : undefined}
                    aria-label={`Page ${n}${n === total ? ", last page" : ""}`}
                    className={clsx(
                      numClass,
                      n === cur
                        ? "border-rx-gold-line bg-rx-gold-tint text-rx-gold-hi"
                        : "border-transparent bg-transparent text-rx-text-2 hover:bg-rx-surface-2 hover:text-rx-text",
                    )}
                  >
                    {n}
                  </button>
                </li>
              ),
            )}
            {tail ? (
              <>
                <li className="min-w-5 text-center text-rx-text-3" aria-hidden>
                  …
                </li>
                <li>
                  <b
                    className="rx-num flex h-9 min-w-9 items-center justify-center px-2 text-[14px] font-semibold text-rx-text-3"
                    title="Use Next to page through this venue's markets"
                  >
                    <span className="sr-only">{fmt(tail)} pages in total</span>
                    <span aria-hidden>{fmt(tail)}</span>
                  </b>
                </li>
              </>
            ) : null}
          </ol>

          <b className="rx-num hidden whitespace-nowrap px-2 text-[14px] font-normal text-rx-text-2 max-md:block">
            Page {fmt(cur)}
            {total ? ` of ${fmt(total)}` : ""}
          </b>

          <button
            type="button"
            className={stepClass}
            onClick={() => go(cur + 1)}
            disabled={!canNext}
            aria-label="Next page"
          >
            Next
            <ChevronIcon direction="right" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}

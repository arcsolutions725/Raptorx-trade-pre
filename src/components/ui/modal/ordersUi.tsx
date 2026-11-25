"use client";

/**
 * Presentation for My orders and positions (prototype design/orders.html + the orders code in
 * design/js/pages.js): venue picker with real venue logos, the record table on desktop and
 * record cards below 1024px (phones and tablets), market names, side / status tags and the
 * empty, loading, error and sign-in states. Props only: MarketInfoModal and
 * PredictFunMarketInfoPanel keep the data, hooks and every action.
 * Styles: styles/pages/account.css (.rx-acct scope).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { AlertTriangle, Check, Clock, List, Wallet } from "lucide-react";

/* ---------------- venues ---------------- */

export type OrdersVenue =
  | "polymarket"
  | "kalshi"
  | "limitless"
  | "myriad"
  | "predictfun";

export const ORDERS_VENUES: readonly {
  key: OrdersVenue;
  label: string;
  short?: string;
  logo: string;
}[] = [
  { key: "polymarket", label: "Polymarket", logo: "/images/brands/polymarket.webp" },
  { key: "kalshi", label: "Kalshi", logo: "/images/brands/kalshi.webp" },
  { key: "limitless", label: "Limitless", logo: "/images/brands/limitless.webp" },
  { key: "myriad", label: "Myriad", logo: "/images/brands/myriad.webp" },
  { key: "predictfun", label: "Predict.fun", logo: "/images/brands/predictfun.webp" },
];

const venueOf = (v: OrdersVenue) => ORDERS_VENUES.find((x) => x.key === v)!;

/** Segmented venue picker (rx-seg) with each venue's logo, in the bar's right slot.
 *  Phones: it scrolls sideways, fades at the right edge until the end, and keeps the
 *  selected venue in view. */
export function VenueSeg({
  value,
  onChange,
}: {
  value: OrdersVenue;
  onChange: (venue: OrdersVenue) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  const measure = useCallback(() => {
    const el = scroller.current;
    if (el) setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    const active = el?.querySelector<HTMLElement>(".rx-seg__item.is-active");
    if (el && active) {
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = left - 8;
      else if (right > el.scrollLeft + el.clientWidth)
        el.scrollLeft = right - el.clientWidth + 8;
    }
    measure();
  }, [value, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div
      ref={scroller}
      className={clsx("o-bar__right", atEnd && "is-end")}
      onScroll={measure}
    >
      <div className="rx-seg o-venue" role="group" aria-label="Market venue">
        {ORDERS_VENUES.map((v) => (
          <button
            key={v.key}
            type="button"
            className={clsx("rx-seg__item", value === v.key && "is-active")}
            aria-pressed={value === v.key}
            onClick={() => onChange(v.key)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 18px brand mark, no optimisation needed */}
            <img src={v.logo} alt="" width={18} height={18} />
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small venue mark + name for a row's second line. */
export function VenueTag({ venue }: { venue: OrdersVenue }) {
  const v = venueOf(venue);
  return (
    <span className="o-src">
      {/* eslint-disable-next-line @next/next/no-img-element -- 14px brand mark */}
      <img src={v.logo} alt="" width={14} height={14} />
      {v.label}
    </span>
  );
}

/* ---------------- market name ---------------- */

type MarketNameProps = {
  title: string;
  /** Second line: outcome, ticker … The venue tag is appended when `venue` is set. */
  sub?: ReactNode;
  venue?: OrdersVenue;
  /** Link target. With `onNavigate` the click is handled in-app (router push). */
  href?: string;
  onNavigate?: () => void;
  /** Open the link in a new tab instead. */
  newTab?: boolean;
  /** Button behaviour (e.g. Polymarket's event lookup) when there is no href. */
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  tooltip?: string;
};

/** Market title (bold) over an outcome / venue line. Renders a link, a button or plain text. */
export function MarketName({
  title,
  sub,
  venue,
  href,
  onNavigate,
  newTab,
  onClick,
  loading,
  disabled,
  tooltip,
}: MarketNameProps) {
  const subLine =
    sub != null || venue ? (
      <small>
        {sub != null ? <span className="truncate">{sub}</span> : null}
        {sub != null && venue ? <span aria-hidden="true">·</span> : null}
        {venue ? <VenueTag venue={venue} /> : null}
      </small>
    ) : null;
  const body = (
    <span>
      <b>
        {loading ? (
          <span
            className="rx-spin mr-1.5 inline-block size-3 align-[-1px] text-rx-gold"
            aria-hidden="true"
          />
        ) : null}
        {title}
      </b>
      {subLine}
    </span>
  );

  if (href) {
    return (
      <a
        className="o-name"
        href={href}
        title={tooltip ?? title}
        {...(newTab
          ? { target: "_blank", rel: "noopener noreferrer" }
          : onNavigate
            ? {
                onClick: (e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault();
                  onNavigate();
                },
              }
            : {})}
      >
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        className="o-name"
        onClick={onClick}
        disabled={disabled}
        title={tooltip ?? title}
        aria-busy={loading || undefined}
      >
        {body}
      </button>
    );
  }
  return (
    <span className="o-name" title={tooltip ?? title}>
      {body}
    </span>
  );
}

/* ---------------- tags ---------------- */

export type Tone = "up" | "down" | "gold" | "neutral";

/** Side or outcome ink ("BUY", "SELL NO", "Yes"…), coloured by direction. */
export function SideTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "o-side",
        tone === "up" && "up",
        tone === "down" && "down",
        tone === "gold" && "gold",
      )}
    >
      {children}
    </span>
  );
}

/** Status / role badge (rx-badge). */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "rx-badge",
        tone === "up" && "rx-badge--up",
        tone === "down" && "rx-badge--down",
        tone === "gold" && "rx-badge--gold",
        tone === "neutral" && "rx-badge--neutral",
      )}
    >
      {children}
    </span>
  );
}

/** Map the free-form trade statuses the venues return onto badge tones. */
export function statusTone(status: string | undefined | null): Tone {
  const s = (status ?? "").toLowerCase();
  if (s === "confirmed" || s === "filled" || s === "matched" || s === "won") return "up";
  if (s === "open" || s === "pending") return "gold";
  if (s === "cancelled" || s === "canceled" || s === "failed" || s === "lost" || s === "lose")
    return "down";
  return "neutral";
}

/** Inline "✓ Transaction Success" note under an action. */
export function SuccessNote({ children = "Transaction Success" }: { children?: ReactNode }) {
  return (
    <span className="o-ok" role="status">
      <Check className="size-3" aria-hidden="true" />
      {children}
    </span>
  );
}

/* ---------------- record table / cards ---------------- */

export type RecordColumn = {
  key: string;
  label: string;
  /** Data cell in the mono face (prices, sizes). */
  num?: boolean;
  /** Muted cell (time stamps). */
  muted?: boolean;
  /** Phone card: leave the value out (it is the card's head tag), or give it half, two thirds
   *  or all of a row (default: a third). */
  card?: false | "half" | "wide" | "full";
  /** Header tooltip. */
  hint?: string;
};

export type RecordRow = {
  key: string;
  /** First column: usually a <MarketName>. */
  market: ReactNode;
  cells: Record<string, ReactNode>;
  /** Card head, right side: side, outcome or status. */
  tag?: ReactNode;
  /** Last column on desktop, the card foot below 1024px. */
  action?: ReactNode;
};

/**
 * Desktop: a flush data table (mono uppercase headers, hover rows, action column on the right).
 * Below 1024px: one record card per row (name + tag, labelled values, full-width action),
 * one column on phones and two on tablets.
 * CSS in account.css switches between the two.
 */
export function RecordTable({
  label,
  columns,
  rows,
  marketLabel = "Market",
  actionLabel,
}: {
  label: string;
  columns: RecordColumn[];
  rows: RecordRow[];
  marketLabel?: string;
  /** Header for the action column; the column is shown when set. Visually hidden when "Actions". */
  actionLabel?: string;
}) {
  const hasAction = !!actionLabel;
  return (
    <>
      <div className="o-scroll" role="region" aria-label={label} tabIndex={0}>
        <table className="o-table">
          <thead>
            <tr>
              <th scope="col">{marketLabel}</th>
              {columns.map((c) => (
                <th key={c.key} scope="col" title={c.hint}>
                  {c.label}
                </th>
              ))}
              {hasAction ? (
                <th scope="col" className="o-act">
                  {actionLabel === "Actions" ? (
                    <span className="sr-only">Actions</span>
                  ) : (
                    actionLabel
                  )}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.market}</td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={clsx(c.num && "rx-num", c.muted && "o-muted")}
                    title={c.hint}
                  >
                    {r.cells[c.key] ?? "—"}
                  </td>
                ))}
                {hasAction ? (
                  <td className="o-act">
                    {r.action ? <span className="o-act__in">{r.action}</span> : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="o-cards" aria-label={label}>
        {rows.map((r) => {
          const stats = columns.filter((c) => c.card !== false);
          return (
            <li key={r.key} className="rc">
              <div className="rc__head">
                {r.market}
                {r.tag ? <span className="rc__tag">{r.tag}</span> : null}
              </div>
              {stats.length ? (
                <dl className="rc__stats">
                  {stats.map((c) => (
                    <div
                      key={c.key}
                      className={clsx(
                        c.card === "half" && "rc__half",
                        c.card === "wide" && "rc__wide",
                        c.card === "full" && "rc__full",
                      )}
                    >
                      <dt>{c.label}</dt>
                      <dd className={c.num ? "rx-num" : undefined}>
                        {r.cells[c.key] ?? "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {r.action ? <div className="rc__foot">{r.action}</div> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ---------------- states ---------------- */

export function OrdersLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="o-loading" role="status">
      <span className="rx-spin" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

const STATE_ICONS = {
  positions: List,
  trades: Clock,
  wallet: Wallet,
  error: AlertTriangle,
} as const;

/** Empty / error / sign-in state: icon tile, title, copy and optional actions. */
export function OrdersState({
  icon = "trades",
  title,
  children,
  actions,
}: {
  icon?: keyof typeof STATE_ICONS;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = STATE_ICONS[icon];
  return (
    <div className="o-empty" role={icon === "error" ? "alert" : undefined}>
      <span className={clsx("o-empty__ico", icon === "error" && "is-error")}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <b>{title}</b>
      {children}
      {actions}
    </div>
  );
}

/** Gold "Show all"-style toggle (rx-check). */
export function RxToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx("rx-check o-check", checked && "is-on")}
    >
      <span className="rx-check__box" aria-hidden="true">
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      {label}
    </button>
  );
}

/** Button label with a leading spinner while busy. */
export function BusyLabel({ busy, busyText, children }: { busy: boolean; busyText: string; children: ReactNode }) {
  return busy ? (
    <>
      <span className="rx-spin" aria-hidden="true" />
      {busyText}
    </>
  ) : (
    <>{children}</>
  );
}

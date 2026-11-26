"use client";

/**
 * Shared presentation pieces of the prediction-market detail page (prototype design/market.html),
 * for every venue: breadcrumbs, stat strip, chart range + legend, trade-ticket parts, feed tabs,
 * the region-blocked notice and page-level loading / error states.
 * Styles: styles/pages/market.css (see the comment block at its top). Pieces used inside a venue
 * interface need the `.rx-mk` root class on that interface; the head pieces live under `.rx-mk-top`.
 */

import "@/styles/pages/market.css";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { MarketThumb } from "@/app/rexmarkets/_components/RexMarketsTable/MarketDataTable/listUi";

type IconProps = { size?: number };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconChevR({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

/** Share (tray with an up arrow), as in the prototype's market head. */
export function IconShare({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5" {...stroke} strokeWidth="2" />
    </svg>
  );
}

/** Report document (the "Generate news intelligence report" button). */
export function IconDoc({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h5" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

export function IconCheck({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l5 5 9-10" {...stroke} strokeWidth="2.6" />
    </svg>
  );
}

/** Compass (design/blocked.html region notice). */
export function IconCompass({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...stroke} strokeWidth="2" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" {...stroke} strokeWidth="2" />
    </svg>
  );
}

export function IconHeart({ size = 14, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        {...stroke}
        fill={filled ? "currentColor" : "none"}
        strokeWidth="2"
      />
    </svg>
  );
}

export function IconClose({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" {...stroke} strokeWidth="2" />
    </svg>
  );
}

/* ---------------- head ---------------- */

/**
 * Breadcrumbs: Rex Predictions › category › market. "Rex Predictions" is a real link to the list;
 * a plain click runs `onBack` (the page's own back handler) when one is given.
 */
export function MarketCrumbs({
  title,
  category,
  onBack,
  href = "/rexmarkets",
}: {
  title?: string | null;
  category?: string | null;
  onBack?: () => void;
  href?: string;
}) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onBack || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onBack();
  };
  return (
    <nav className="mk-crumbs" aria-label="Breadcrumb">
      <a href={href} onClick={handleClick}>
        Rex Predictions
      </a>
      <IconChevR />
      {category ? (
        <>
          <span className="mk-crumbs__cat" title={category}>
            {category}
          </span>
          <IconChevR />
        </>
      ) : null}
      <span aria-current="page" title={title || undefined}>
        {title || "Market"}
      </span>
    </nav>
  );
}

export type StatItem = {
  label: string;
  value: ReactNode;
  tone?: "up" | "down";
};

/** Prototype .stat-strip: mono label over a mono value, split by 1px lines. */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <dl className="mk-stats">
      {items.map((it) => (
        <div key={it.label}>
          <dt>{it.label}</dt>
          <dd className={it.tone ? `is-${it.tone}` : undefined}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------- chart ---------------- */

/** Chart range picker (rx-seg rx-seg--mono). */
export function RangeSeg<T extends string>({
  ranges,
  value,
  onChange,
  label = "Chart range",
}: {
  ranges: readonly T[];
  value: T;
  onChange: (range: T) => void;
  label?: string;
}) {
  return (
    <div className="rx-seg rx-seg--mono" role="group" aria-label={label}>
      {ranges.map((r) => (
        <button
          key={r}
          type="button"
          className={`rx-seg__item${value === r ? " is-active" : ""}`}
          aria-pressed={value === r}
          onClick={() => onChange(r)}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export type LegendItem = {
  key: string;
  label: string;
  color: string;
  /** e.g. "64%" */
  value?: string;
  on: boolean;
};

/** Series toggles under a chart: coloured checks (prototype #legend). */
export function ChartLegend({
  items,
  onToggle,
}: {
  items: LegendItem[];
  onToggle: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mk-legend">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`rx-check${it.on ? " is-on" : ""}`}
          aria-pressed={it.on}
          title={it.label}
          style={{ "--c": it.color } as CSSProperties}
          onClick={() => onToggle(it.key)}
        >
          <span className="rx-check__box">
            <IconCheck size={11} />
          </span>
          <span className="mk-legend__name">{it.label}</span>
          {it.value ? <span className="rx-num mk-legend__val">{it.value}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ---------------- trade ticket ---------------- */

/** Mini market head at the top of the ticket. */
export function TicketHead({
  imageUrl,
  title,
  sub,
}: {
  imageUrl?: string | null;
  title?: string | null;
  sub?: ReactNode;
}) {
  return (
    <div className="mk-ticket__head">
      <MarketThumb src={imageUrl} title={title || "Market"} size={36} />
      <div className="mk-ticket__title">
        <b title={title || undefined}>{title || "Market"}</b>
        {sub ? <span className="rx-small">{sub}</span> : null}
      </div>
    </div>
  );
}

/** Buy / Sell segmented control: the active side is green (Buy) or red (Sell). */
export function SideSeg({
  value,
  onChange,
}: {
  value: "buy" | "sell";
  onChange: (side: "buy" | "sell") => void;
}) {
  return (
    <div className="rx-seg mk-side-seg" role="group" aria-label="Side">
      <button
        type="button"
        className={`rx-seg__item${value === "buy" ? " is-active is-buy" : ""}`}
        aria-pressed={value === "buy"}
        onClick={() => onChange("buy")}
      >
        Buy
      </button>
      <button
        type="button"
        className={`rx-seg__item${value === "sell" ? " is-active is-sell" : ""}`}
        aria-pressed={value === "sell"}
        onClick={() => onChange("sell")}
      >
        Sell
      </button>
    </div>
  );
}

/** Big Yes / No outcome buttons (rx-yes / rx-no --l). Prices come formatted. */
export function YesNoPair({
  selected,
  yesPrice,
  noPrice,
  onSelect,
  yesLabel = "Yes",
  noLabel = "No",
  disabled,
}: {
  selected: "Yes" | "No" | null | undefined;
  yesPrice: ReactNode;
  noPrice: ReactNode;
  onSelect: (outcome: "Yes" | "No") => void;
  yesLabel?: ReactNode;
  noLabel?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="mk-yn" role="group" aria-label="Outcome">
      <button
        type="button"
        className={`rx-yes rx-yes--l${selected === "Yes" ? " is-selected" : ""}`}
        aria-pressed={selected === "Yes"}
        onClick={() => onSelect("Yes")}
        disabled={disabled}
      >
        {yesLabel} <span className="rx-num">{yesPrice}</span>
      </button>
      <button
        type="button"
        className={`rx-no rx-no--l${selected === "No" ? " is-selected" : ""}`}
        aria-pressed={selected === "No"}
        onClick={() => onSelect("No")}
        disabled={disabled}
      >
        {noLabel} <span className="rx-num">{noPrice}</span>
      </button>
    </div>
  );
}

/** "Current market price" row in a well. */
export function PriceWell({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rx-well mk-price">
      <span className="rx-small">{label}</span>
      <span className="rx-num">{value}</span>
    </div>
  );
}

export type PctChip = { label: string; onClick: () => void; disabled?: boolean };

/** Amount input: label (+ optional note on the right), prefix, value, and % chips inside the field. */
export function AmountField({
  id,
  label,
  aside,
  prefix,
  value,
  onChange,
  disabled,
  placeholder = "0",
  pcts,
}: {
  id: string;
  label: ReactNode;
  aside?: ReactNode;
  prefix?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  pcts?: PctChip[];
}) {
  return (
    <div className="rx-field mk-amount">
      <div className="mk-amount__top">
        <label className="rx-label" htmlFor={id}>
          {label}
        </label>
        {aside ? <span className="rx-help">{aside}</span> : null}
      </div>
      <div className="rx-input">
        {prefix ? <span className="rx-num mk-amount__pre">{prefix}</span> : null}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        {pcts && pcts.length > 0 ? (
          <div className="rx-pct">
            {pcts.map((p) => (
              <button key={p.label} type="button" onClick={p.onClick} disabled={p.disabled}>
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Region-blocked notice, after design/blocked.html (icon, eyebrow, heading, short text) in a compact
 * inline form for the trade ticket.
 */
export function RegionBlockedNotice({
  country,
  title = "Trading not available in your region",
  text,
}: {
  country?: string | null;
  title?: ReactNode;
  text?: ReactNode;
}) {
  return (
    <div className="mk-blocked" role="note">
      <span className="mk-blocked__ico">
        <IconCompass />
      </span>
      <div className="mk-blocked__txt">
        <span className="rx-eyebrow">Region restricted</span>
        <b>{title}</b>
        <p>
          {text ??
            `Prediction markets can't be traded where you're connecting from${
              country ? ` (${country})` : ""
            }.`}
        </p>
      </div>
    </div>
  );
}

/* ---------------- lower sections ---------------- */

export type FeedTab<K extends string> = { key: K; label: string; count?: number };

/** Comments / activity tabs (rx-tabs). */
export function FeedTabs<K extends string>({
  tabs,
  active,
  onChange,
  label = "Market feed",
}: {
  tabs: FeedTab<K>[];
  active: K;
  onChange: (key: K) => void;
  label?: string;
}) {
  return (
    <div className="rx-tabs mk-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`rx-tab${active === t.key ? " is-active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {typeof t.count === "number" && t.count > 0 ? (
            <span className="rx-count">{t.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Outcome tabs above the order book (multi-outcome events). */
export function OutcomeTabs({
  items,
  selectedIndex,
  onSelect,
}: {
  items: { key: string; label: string }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mk-outcomes" role="group" aria-label="Outcome">
      {items.map((it, index) => (
        <button
          key={it.key}
          type="button"
          className={`rx-tab${selectedIndex === index ? " is-active" : ""}`}
          aria-pressed={selectedIndex === index}
          onClick={() => onSelect(index)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- page-level states (page.tsx shells) ---------------- */

export function MarketPageLoading({ label = "Loading market data..." }: { label?: string }) {
  return (
    <div className="rx-mk-state" role="status">
      <span className="rx-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function MarketPageMessage({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rx-mk-state rx-mk-state--error" role="alert">
      <b>{title}</b>
      {children}
    </div>
  );
}

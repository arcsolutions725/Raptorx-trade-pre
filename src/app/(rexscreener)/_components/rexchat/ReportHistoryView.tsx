/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * Report history, presentation only (design/history.html + pages.css .h-table / .rc-list).
 * Each report shows its token logo (or the prediction venue's logo), kind, source and when it
 * was last generated, with Open / Regenerate / Delete. Narrow drawer: record cards. Wide
 * drawer (the 700px desktop panel): table rows. Styles: styles/pages/reports.css (.rx-rh).
 * State and data live in ChatSidebar.tsx; this file only renders what it is given.
 */

import { useEffect, useId, useState } from "react";
import { dexScreenerTokenImageUrl } from "@/lib/api/dexscreener";
import { normalizeSwapChain, type SwapChain } from "@/lib/swapChain";
import "@/styles/pages/reports.css";

export type ReportKind = "token" | "market";
export type ReportVenue = "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun";

type ChainMeta = { label: string; src: string };

export type ReportHistoryIcon =
  | { type: "token"; srcs: string[]; seed: string; monogram: string; chain: ChainMeta | null }
  | { type: "venue"; venue: ReportVenue }
  | { type: "image"; src: string; fallback: string }
  | { type: "none" };

export type ReportHistoryItem = {
  id: string;
  kind: ReportKind;
  /** "$SOL" for tokens, the market title for prediction reports. */
  title: string;
  subtitle: string | null;
  /** "RexScreener · Base", "Kalshi" … */
  source: string;
  icon: ReportHistoryIcon;
  /** Last generated (updatedAt). */
  updatedAt: string | Date;
  /** Lower-cased text the search box matches against. */
  search: string;
};

const CHAINS: Record<SwapChain, ChainMeta> = {
  solana: { label: "Solana", src: "/images/solana.png" },
  ethereum: { label: "Ethereum", src: "/images/ETH_light_logo.webp" },
  base: { label: "Base", src: "/images/brands/base.webp" },
  bsc: { label: "BNB Chain", src: "/images/bnbchain.png" },
  monad: { label: "Monad", src: "/images/monad.png" },
  robinhood: { label: "Robinhood", src: "/images/robinhood.png" },
};

const VENUES: Record<ReportVenue, { label: string; logo: string }> = {
  kalshi: { label: "Kalshi", logo: "/images/brands/kalshi.webp" },
  polymarket: { label: "Polymarket", logo: "/images/brands/polymarket.webp" },
  limitless: { label: "Limitless", logo: "/images/brands/limitless.webp" },
  myriad: { label: "Myriad", logo: "/images/brands/myriad.webp" },
  predictfun: { label: "Predict.fun", logo: "/images/brands/predictfun.webp" },
};

/* ------------------------------------------------------------------ */
/* Report row → view model                                             */
/* ------------------------------------------------------------------ */

type AnyRecord = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isRecord = (v: unknown): v is AnyRecord => !!v && typeof v === "object" && !Array.isArray(v);
const isEvmAddress = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a);

/**
 * The venue a prediction report came from. Stored `marketData` is that venue's market-details
 * payload, and each venue's mapper leaves a field only it sets (see lib/{kalshi,myriad,…} mappers);
 * the image host is the fallback for older rows.
 */
export function inferReportVenue(marketData: unknown): ReportVenue | null {
  if (!isRecord(marketData)) return null;
  const md = marketData;
  const img = [md.symbol_image_url, md.image, md.icon].map(str).join(" ");
  if ("myriadMarketId" in md || /myriad/i.test(img)) return "myriad";
  if ("ranged_group_name" in md || /kalshi|d1lvyva3zy5u58\.cloudfront\.net/i.test(img)) return "kalshi";
  if ("series_id" in md || /polymarket/i.test(img)) return "polymarket";
  if ("conditionId" in md || /limitless/i.test(img)) return "limitless";
  const raw = isRecord(md.rawEventData) ? md.rawEventData : null;
  if (/predict\.?fun/i.test(img) || str(md.category).toLowerCase() === "predictfun" || (raw && "parentCategory" in raw))
    return "predictfun";
  return null;
}

/** Category label for a market ("sports" → "Sports"); venue names and internal variants are skipped. */
function marketCategory(marketData: unknown): string | null {
  if (!isRecord(marketData)) return null;
  const c = str(marketData.category);
  if (!c || /^[A-Z0-9_]+$/.test(c) || /^(predictfun|myriad|limitless|kalshi|polymarket)$/i.test(c)) return null;
  const h = c.replace(/[-_]+/g, " ").trim();
  return h ? h.charAt(0).toUpperCase() + h.slice(1) : null;
}

/**
 * The chain a token report is on. The list endpoint returns no `chain`, so: the DexScreener
 * pair from a cached copy of the full report, then a stored chain (never its "solana" default
 * over an 0x address), then BSC when Bitquery holder/security data was saved (only stored for
 * BSC), then Solana for a base58 mint. Unknown for any other 0x address.
 */
function tokenChain(address: string, report: AnyRecord, cached: AnyRecord | null): SwapChain | undefined {
  const dex = isRecord(report.dexData) ? report.dexData : isRecord(cached?.dexData) ? (cached!.dexData as AnyRecord) : null;
  const fromDex = normalizeSwapChain(str(dex?.chainId));
  if (fromDex) return fromDex;
  const stored = normalizeSwapChain(str(report.chain) || str(cached?.chain));
  if (stored && !(stored === "solana" && isEvmAddress(address))) return stored;
  if (report.holdersData || report.securityData) return "bsc";
  if (address && !isEvmAddress(address)) return "solana";
  return undefined;
}

/**
 * Report (from GET /api/reports) → history row. `cached` is the full report when this browser
 * has it (opened before): it carries the DexScreener pair with the token's image and chain.
 */
export function buildReportHistoryItem(report: AnyRecord, cached: AnyRecord | null = null): ReportHistoryItem {
  const id = String(report.id);
  const updatedAt = (report.updatedAt ?? report.createdAt ?? Date.now()) as string | Date;
  const ticker = str(report.ticker);
  const address = str(report.contractAddress);
  const projectName = str(report.projectName);

  if (report.reportType === "market") {
    const md = report.marketData ?? cached?.marketData ?? null;
    const venue = inferReportVenue(md);
    const title = projectName || ticker || "Prediction market";
    const source = venue ? VENUES[venue].label : "Rex Predictions";
    const img = isRecord(md) ? str(md.symbol_image_url) || str(md.image) || str(md.icon) : "";
    return {
      id,
      kind: "market",
      title,
      subtitle: marketCategory(md),
      source,
      icon: venue ? { type: "venue", venue } : img ? { type: "image", src: img, fallback: title } : { type: "none" },
      updatedAt,
      search: [title, ticker, address, source].join(" ").toLowerCase(),
    };
  }

  const chain = tokenChain(address, report, cached);
  const dex = isRecord(report.dexData) ? report.dexData : isRecord(cached?.dexData) ? (cached!.dexData as AnyRecord) : null;
  const info = isRecord(dex?.info) ? (dex!.info as AnyRecord) : null;
  const srcs = [str(info?.imageUrl), dexScreenerTokenImageUrl(chain, address) || ""].filter(
    (s, i, all) => !!s && all.indexOf(s) === i,
  );
  const meta = chain ? CHAINS[chain] : null;
  const shortAddr = address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
  const source = meta ? `RexScreener · ${meta.label}` : "RexScreener";
  return {
    id,
    kind: "token",
    title: `$${ticker || "?"}`,
    subtitle: projectName || shortAddr || null,
    source,
    icon: {
      type: "token",
      srcs,
      seed: address || ticker,
      monogram: (ticker || "?").slice(0, 2).toUpperCase(),
      chain: meta,
    },
    updatedAt,
    search: [ticker, address, projectName, source].join(" ").toLowerCase(),
  };
}

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
const timeOf = (d: Date) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
/** 11/17/2026 09:12 AM (table) */
const longDate = (d: Date) => `${d.toLocaleDateString("en-US")} ${timeOf(d)}`;
/** 11/17 09:12 AM (cards) */
const shortDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${timeOf(d)}`;

export function formatRelativeTime(v: string | Date): string {
  const d = toDate(v);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const Svg = ({ size, children }: { size: number; children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {children}
  </svg>
);
const IconSearch = () => (
  <Svg size={14}>
    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);
const IconClock = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);
const IconRefresh = () => (
  <Svg size={15}>
    <path d="M20 11a8 8 0 10-2 6M20 4v7h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const IconTrash = () => (
  <Svg size={15}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const IconBack = () => (
  <Svg size={18}>
    <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** Muted, stable hue per token for the initials fallback (same rule as the screener rows). */
function monogramBackground(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 38% 34%)`;
}

/** Token logo: tries each image in turn (stored DexScreener image, then the CDN icon), then initials. */
function TokenLogo({ icon }: { icon: Extract<ReportHistoryIcon, { type: "token" }> }) {
  const key = icon.srcs.join("|");
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [key]);
  const src = icon.srcs[idx];
  return (
    <span
      className="rx-avatar rx-avatar--token rx-rh__tok"
      style={{ background: src ? "var(--rx-surface-3)" : monogramBackground(icon.seed) }}
    >
      {src ? (
        <img className="rx-avatar__img" src={src} alt="" loading="lazy" onError={() => setIdx((i) => i + 1)} />
      ) : (
        <small aria-hidden="true">{icon.monogram}</small>
      )}
      {icon.chain ? (
        <span className="rx-avatar__chain overflow-hidden bg-rx-surface-3" title={icon.chain.label}>
          <img src={icon.chain.src} alt="" className="block size-full object-cover" />
        </span>
      ) : null}
    </span>
  );
}

function MarketImage({ src, fallback }: { src: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) {
    return (
      <span className="rx-rh__ico" aria-hidden="true">
        <b className="font-display text-[13px] text-rx-text-3">{fallback.charAt(0).toUpperCase() || "?"}</b>
      </span>
    );
  }
  return (
    <span className="rx-rh__ico">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

function ReportIcon({ icon }: { icon: ReportHistoryIcon }) {
  if (icon.type === "token") return <TokenLogo icon={icon} />;
  if (icon.type === "venue") {
    return (
      <span className="rx-rh__ico rx-rh__ico--venue" title={VENUES[icon.venue].label}>
        <img src={VENUES[icon.venue].logo} alt="" width={40} height={40} loading="lazy" />
      </span>
    );
  }
  if (icon.type === "image") return <MarketImage src={icon.src} fallback={icon.fallback} />;
  return (
    <span className="rx-rh__ico" aria-hidden="true">
      <IconClock />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

export type ReportHistoryRowState = {
  current: boolean;
  regenerating: boolean;
  /** Seconds left while regenerating (null until the timer starts). */
  countdown: number | null;
  regenerated: boolean;
  confirmingDelete: boolean;
  deleting: boolean;
};

type RowHandlers = {
  onOpen: (id: string) => void;
  onRegenerate: (id: string) => void;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
};

export function ReportHistoryRow({
  item,
  state,
  showKind,
  ...h
}: { item: ReportHistoryItem; state: ReportHistoryRowState; showKind: boolean } & RowHandlers) {
  const updated = toDate(item.updatedAt);
  const relative = formatRelativeTime(updated);
  const isToken = item.kind === "token";

  return (
    <li className="rx-rh__row" aria-current={state.current ? "true" : undefined}>
      <div className="rx-rh__top">
        <button type="button" className="rx-rh__name" onClick={() => h.onOpen(item.id)} title={`Open ${item.title}`}>
          <ReportIcon icon={item.icon} />
          <span className="rx-rh__label">
            <b>{item.title}</b>
            {item.subtitle ? <small>{item.subtitle}</small> : null}
            {state.current ? <span className="rx-rh__now rx-rh__narrow">Open now</span> : null}
          </span>
        </button>
        {showKind ? (
          <span className={`rx-badge rx-rh__kind ${isToken ? "rx-badge--gold" : "rx-badge--neutral"}`}>
            {isToken ? "Token" : "Prediction"}
            <span className="rx-rh__wide"> report</span>
          </span>
        ) : null}
      </div>

      <dl className="rx-rh__stats">
        <div>
          <dt>Source</dt>
          <dd title={item.source}>{item.source}</dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd className="rx-num" title={`Last generated ${relative}`}>
            <span className="rx-rh__wide">{longDate(updated)}</span>
            <span className="rx-rh__narrow">{shortDate(updated)}</span>
          </dd>
        </div>
      </dl>

      <div className="rx-rh__acts">
        <button type="button" className="rx-btn rx-btn--secondary rx-rh__open" onClick={() => h.onOpen(item.id)}>
          <span className="rx-rh__narrow">Open report</span>
          <span className="rx-rh__wide">Open</span>
          <span className="sr-only"> {item.title}</span>
        </button>
        <button
          type="button"
          className="rx-icon-btn"
          onClick={() => {
            if (!state.regenerating) h.onRegenerate(item.id);
          }}
          disabled={state.regenerating}
          aria-label={
            state.regenerating
              ? `Regenerating ${item.title}${state.countdown !== null ? `, about ${state.countdown} seconds left` : ""}`
              : `Regenerate ${item.title}`
          }
          title={state.regenerated ? "Regenerated" : "Regenerate"}
        >
          {state.regenerating && state.countdown !== null ? (
            <span className="rx-rh__timer" aria-hidden="true">
              {state.countdown}s
            </span>
          ) : state.regenerating ? (
            <span className="rx-spin" aria-hidden="true" />
          ) : state.regenerated ? (
            <span className="rx-rh__done" aria-hidden="true">
              Done
            </span>
          ) : (
            <IconRefresh />
          )}
        </button>
        <button
          type="button"
          className="rx-icon-btn rx-rh__del"
          onClick={() => h.onAskDelete(item.id)}
          aria-label={`Delete ${item.title}`}
          title="Delete report"
        >
          <IconTrash />
        </button>
      </div>

      {state.confirmingDelete ? (
        <div
          className="rx-rh__confirm"
          role="alertdialog"
          aria-label={`Delete ${item.title}?`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              h.onCancelDelete();
            }
          }}
        >
          <p>
            <b>Delete this report?</b> This can&apos;t be undone.
          </p>
          <div>
            <button
              type="button"
              className="rx-btn rx-btn--danger"
              onClick={() => h.onConfirmDelete(item.id)}
              disabled={state.deleting}
            >
              {state.deleting ? "Deleting…" : "Delete"}
            </button>
            <button type="button" className="rx-btn rx-btn--secondary" onClick={h.onCancelDelete} autoFocus>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer                                                              */
/* ------------------------------------------------------------------ */

export type ReportKindFilter = "all" | ReportKind;

export type ReportHistoryViewProps = RowHandlers & {
  /** Which reports this drawer lists; "all" adds the kind tabs and badges. */
  scope: "crypto" | "market" | "all";
  items: ReportHistoryItem[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  kind: ReportKindFilter;
  onKindChange: (k: ReportKindFilter) => void;
  currentId?: string;
  regeneratingId: string | null;
  countdown: number | null;
  regenerated: Record<string, boolean>;
  confirmDeleteId: string | null;
  deleting: boolean;
  onClose?: () => void;
};

const TABS: { key: ReportKindFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "token", label: "Token reports" },
  { key: "market", label: "Prediction reports" },
];

export function ReportHistoryView(p: ReportHistoryViewProps) {
  const listId = useId();
  const titleId = useId();
  const showKind = p.scope === "all";
  const n = p.items.length;
  const placeholder =
    p.scope === "crypto"
      ? "Search by ticker, name or address"
      : p.scope === "market"
        ? "Search by market or ticker"
        : "Search by ticker or market";
  const emptyHint = p.query.trim()
    ? p.scope === "crypto"
      ? "Try another ticker, name or contract address."
      : "Try another ticker or market name."
    : p.scope === "market"
      ? "Generate a report on any prediction market and it shows up here."
      : "Generate your first report to get started!";

  return (
    <section className="rx-rh" data-kinds={showKind ? "1" : undefined} aria-labelledby={titleId}>
      <div className="rx-rh__head">
        {p.onClose ? (
          <button type="button" className="rx-icon-btn" onClick={p.onClose} aria-label="Close report history">
            <IconBack />
          </button>
        ) : null}
        <div className="rx-rh__title">
          <span className="rx-eyebrow">Rex Pilot</span>
          <h2 id={titleId}>Report history</h2>
        </div>
      </div>

      <div className="rx-rh__bar">
        {showKind ? (
          <div className="rx-tabs rx-rh__tabs" role="tablist" aria-label="Report kind">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={p.kind === t.key}
                aria-controls={listId}
                className={`rx-tab${p.kind === t.key ? " is-active" : ""}`}
                onClick={() => p.onKindChange(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <label className="rx-input rx-rh__search">
          <IconSearch />
          <span className="sr-only">Search report history</span>
          <input
            type="search"
            value={p.query}
            onChange={(e) => p.onQueryChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
        </label>
        <span className="rx-rh__count rx-num" aria-live="polite">
          {p.loading ? "Loading…" : `${n} report${n === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="rx-rh__scroll custom-sidebar-scrollbar">
        {p.loading ? (
          <ul className="rx-rh__list" aria-label="Loading reports" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="rx-rh__skel">
                <span className="rx-skel size-9 shrink-0 rounded-[10px]" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="rx-skel h-3.5 w-24" />
                  <span className="rx-skel h-3 w-40 max-w-full" />
                </span>
              </li>
            ))}
          </ul>
        ) : n === 0 ? (
          <div className="rx-rh__empty">
            <span className="text-rx-gold-hi">
              <IconClock size={22} />
            </span>
            <b>{p.query.trim() ? "No reports match" : "No reports yet"}</b>
            <p>{emptyHint}</p>
          </div>
        ) : (
          <>
            <div className="rx-rh__cols" aria-hidden="true">
              <span>Report</span>
              {showKind ? <span>Kind</span> : null}
              <span>Source</span>
              <span>Last generated</span>
              <span />
            </div>
            <ul className="rx-rh__list" id={listId} aria-label="Reports">
              {p.items.map((item) => (
                <ReportHistoryRow
                  key={item.id}
                  item={item}
                  showKind={showKind}
                  state={{
                    current: p.currentId === item.id,
                    regenerating: p.regeneratingId === item.id,
                    countdown: p.regeneratingId === item.id ? p.countdown : null,
                    regenerated: !!p.regenerated[item.id],
                    confirmingDelete: p.confirmDeleteId === item.id,
                    deleting: p.deleting,
                  }}
                  onOpen={p.onOpen}
                  onRegenerate={p.onRegenerate}
                  onAskDelete={p.onAskDelete}
                  onCancelDelete={p.onCancelDelete}
                  onConfirmDelete={p.onConfirmDelete}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

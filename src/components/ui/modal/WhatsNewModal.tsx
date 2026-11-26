/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import copy from "copy-to-clipboard";
import type { WhatsNewTweet } from "@/lib/api/tweetQuality";
import type { ProjectSocialLinks } from "@/lib/api/projectSocials";
import type { SwapChain } from "@/lib/swapChain";
import {
  REX_SCREENER_EXCHANGE_HREF,
  requestShellAction,
} from "@/components/ui/layout/shellActions";
import { markClawV5Prefill, markClawV5ScrollToInput } from "@/lib/clawV5/scrollIntent";
import "@/styles/pages/reports.css";

export type WhatsNewParagraph = { title: string; body: string };

export type WhatsNewResult = {
  summary: string;
  paragraphs?: WhatsNewParagraph[];
  tweets: WhatsNewTweet[];
  metadata?: {
    contractAddress: string;
    ticker: string;
    projectName?: string | null;
    generatedAt?: string;
    links?: ProjectSocialLinks;
    imageUrl?: string | null;
  };
};

/**
 * The "Trade <SYM>" card (design b7fb8bb). It does not mount a second swap widget: Li.Fi's
 * widget events are one module-level emitter and SwapWidget clears every listener on unmount,
 * so a swap inside this popup would unhook the screener panel's swap (see the report). The card
 * opens that panel's Exchange with this token instead, on the same page.
 */
export type WhatsNewTrade = {
  symbol: string;
  name?: string | null;
  logo?: string | null;
  chain?: SwapChain | null;
  /** Open the screener's Exchange with this token selected. The popup closes itself. */
  onTrade: () => void;
  /** "Full Exchange" link. Default: the page's Exchange (shell action), else RexScreener's Exchange. */
  onFullExchange?: () => void;
};

/** Market numbers for the "Key facts" card (design whats-new.html rail). Only values main already has. */
export type WhatsNewFacts = {
  priceUsd?: number | null;
  change24h?: number | null;
  marketCap?: number | null;
  volume24h?: number | null;
  liquidityUsd?: number | null;
  /** Pair creation time (ms). */
  createdAt?: number | null;
  contract?: string | null;
};

/**
 * "Open chart" (design report.html / whats-new.html actions card): the token's RexScreener page.
 * `onOpen` handles the click on the same page instead (e.g. closes the panel that covers the
 * chart) and returns true when it did; otherwise the link navigates.
 */
export type TokenChartAction = { href: string; onOpen?: () => boolean };

/** Actions card in the popup (design whats-new.html): Ask Claw about SYM · Open chart · Full Report. */
export type WhatsNewActions = {
  chart?: TokenChartAction | null;
  /** Open (or go back to) this token's Full Report. The popup closes itself. */
  onFullReport?: (() => void) | null;
  /** "Ask Claw about SYM" shows whenever the ticker is known; set to hide it. */
  hideAskClaw?: boolean;
};

/** One of the viewer's own saved reports (design "Recently generated" card). */
export type RecentReport = { id: string; title: string; detail: string | null };

export type RecentReports = {
  items: RecentReport[];
  /** Open that report. The popup closes itself. */
  onOpen: (id: string) => void;
  onViewHistory?: (() => void) | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  result: WhatsNewResult | null;
  fallbackLinks?: ProjectSocialLinks | null;
  imageUrl?: string | null;
  /** Ticker for the title while the mini-report loads. */
  symbol?: string | null;
  /** Trade card: shown when the popup is about a tradable token. */
  trade?: WhatsNewTrade | null;
  /** Key facts card (price, 24h, market cap, volume, liquidity, age, contract). */
  facts?: WhatsNewFacts | null;
  /** Actions card: Ask Claw (by default), Open chart and Full Report when the caller can do them. */
  actions?: WhatsNewActions | null;
  /** "Recently generated": the viewer's other saved reports, when the caller has them. */
  recent?: RecentReports | null;
};

/** Source icons (design/assets/whats-new). */
const WN = (k: string) => `/images/whats-new/${k}.webp`;
const MASCOT = encodeURI("/images/what'snew/Orange Rex Logo.png");

const SOCIALS: { key: keyof ProjectSocialLinks; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "telegram", label: "Telegram" },
  { key: "twitter", label: "X" },
  { key: "reddit", label: "Reddit" },
];

const CHAIN_LABEL: Record<SwapChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  bsc: "BNB Chain",
  monad: "Monad",
  robinhood: "Robinhood",
};
const CHAIN_ICON: Record<SwapChain, string> = {
  solana: "/images/solana.png",
  ethereum: "/images/ETH_light_logo.webp",
  base: "/images/brands/base.webp",
  bsc: "/images/bnbchain.png",
  monad: "/images/monad.png",
  robinhood: "/images/robinhood.png",
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function parseDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const d = new Date(numeric > 1e12 ? numeric : numeric * 1000);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Compact age, as in the prototype list: "now", "22m", "1h", "3d", "2w", "4mo", "1y". */
function compactAge(raw: string): string {
  const d = parseDate(raw);
  if (!d) return "";
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  if (days < 35) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** "updated just now" / "updated 5 min ago" / "updated 2 h ago" from the API's generatedAt. */
function updatedLabel(raw?: string): string | null {
  const d = parseDate(raw);
  if (!d) return null;
  const m = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (m < 1) return "updated just now";
  if (m < 60) return `updated ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `updated ${h} h ago`;
  return `updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function fmtUsdCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

/** Compact age from a timestamp: "5h", "3d", "11mo", "2y". */
function fmtAge(ms: number): string {
  const sec = Math.max(0, (Date.now() - ms) / 1000);
  const h = sec / 3600;
  if (h < 1) return `${Math.max(1, Math.floor(sec / 60))}m`;
  if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

export function hasFacts(f?: WhatsNewFacts | null): f is WhatsNewFacts {
  if (!f) return false;
  return (
    [f.priceUsd, f.change24h, f.marketCap, f.volume24h, f.liquidityUsd, f.createdAt].some(isNum) ||
    !!f.contract
  );
}

function paragraphsFromResult(result: WhatsNewResult): WhatsNewParagraph[] {
  if (result.paragraphs?.length) return result.paragraphs;
  const text = (result.summary || "").trim();
  if (!text) return [];
  return [{ title: "What's happening", body: text }];
}

function monogramBackground(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 38% 34%)`;
}

/** Token avatar: logo when it loads, else initials on a stable muted hue. */
function TokenAvatar({
  src,
  symbol,
  className,
  chain,
}: {
  src?: string | null;
  symbol: string;
  className?: string;
  chain?: SwapChain | null;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const show = !!src && !failed;
  return (
    <span
      className={`rx-avatar rx-avatar--token ${className ?? ""}`}
      style={{ background: show ? "var(--rx-surface-3)" : monogramBackground(symbol || "?") }}
    >
      {show ? (
        <img className="rx-avatar__img" src={src!} alt="" onError={() => setFailed(true)} />
      ) : (
        <small aria-hidden="true">{(symbol || "?").slice(0, 2).toUpperCase()}</small>
      )}
      {chain ? (
        <span className="rx-avatar__chain overflow-hidden bg-rx-surface-3" title={CHAIN_LABEL[chain]}>
          <img src={CHAIN_ICON[chain]} alt="" className="block size-full object-cover" />
        </span>
      ) : null}
    </span>
  );
}

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const IconExt = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 17L17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSwap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 7h12l-3-3M17 17H5l3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconHeart = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z" fill="currentColor" />
  </svg>
);
const IconRepost = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 7h11v5M17 17H6v-5M15 4l3 3-3 3M9 20l-3-3 3-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconEye = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const IconVerified = () => (
  <svg className="rx-wn__verified" viewBox="0 0 24 24" aria-label="Verified account" role="img">
    <path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z" fill="currentColor" />
    <path d="M8 12.2l2.6 2.6L16.2 9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** "Trade <SYM>" card: the token, a swap button and the small Full Exchange link. */
export function WhatsNewTradeCard({
  trade,
  onClose,
  className = "",
}: {
  trade: WhatsNewTrade;
  onClose: () => void;
  className?: string;
}) {
  const titleId = useId();
  const sym = trade.symbol.replace(/^\$/, "").toUpperCase();
  const chain = trade.chain ?? null;
  const sub = [trade.name && trade.name !== sym ? trade.name : null, chain ? CHAIN_LABEL[chain] : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className={`rx-raised rx-wn-trade ${className}`} aria-labelledby={titleId}>
      <div className="rx-wn-trade__head">
        <h3 id={titleId}>Trade {sym}</h3>
        <Link
          className="rx-wn-trade__ex"
          href={REX_SCREENER_EXCHANGE_HREF}
          onClick={(e) => {
            if (trade.onFullExchange) {
              e.preventDefault();
              trade.onFullExchange();
              onClose();
              return;
            }
            if (requestShellAction("exchange")) {
              e.preventDefault();
              onClose();
            }
          }}
        >
          Full Exchange
          <IconExt />
        </Link>
      </div>
      <div className="rx-well rx-wn-trade__tok">
        <TokenAvatar src={trade.logo} symbol={sym} chain={chain} />
        <span>
          <b>{sym}</b>
          {sub ? <small>{sub}</small> : null}
        </span>
      </div>
      <button
        type="button"
        className="rx-btn rx-btn--primary rx-btn--l rx-btn--block"
        onClick={() => {
          trade.onTrade();
          onClose();
        }}
      >
        <IconSwap />
        Swap {sym}
      </button>
      <p className="rx-help">Opens the swap beside the chart with {sym} already selected.</p>
    </section>
  );
}

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 9h11v11H9zM5 15H4V4h11v1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** "Key facts" card (design whats-new.html .rail-card .facts). */
export function WhatsNewFactsCard({ facts, className = "" }: { facts: WhatsNewFacts; className?: string }) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const rows: { label: string; value: string; tone?: "up" | "down" }[] = [];
  if (isNum(facts.priceUsd)) rows.push({ label: "Price", value: fmtPrice(facts.priceUsd) });
  if (isNum(facts.change24h))
    rows.push({
      label: "24h",
      value: `${facts.change24h >= 0 ? "▲" : "▼"} ${Math.abs(facts.change24h).toFixed(2)}%`,
      tone: facts.change24h >= 0 ? "up" : "down",
    });
  if (isNum(facts.marketCap)) rows.push({ label: "Market cap", value: fmtUsdCompact(facts.marketCap) });
  if (isNum(facts.volume24h)) rows.push({ label: "Volume 24h", value: fmtUsdCompact(facts.volume24h) });
  if (isNum(facts.liquidityUsd)) rows.push({ label: "Liquidity", value: fmtUsdCompact(facts.liquidityUsd) });
  if (isNum(facts.createdAt) && facts.createdAt > 0) rows.push({ label: "Age", value: fmtAge(facts.createdAt) });
  const ca = facts.contract?.trim() || "";

  return (
    <section className={`rx-raised rx-wn-facts ${className}`} aria-labelledby={titleId}>
      <h3 id={titleId}>Key facts</h3>
      <dl>
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd className={r.tone ? `is-${r.tone}` : undefined}>{r.value}</dd>
          </div>
        ))}
        {ca ? (
          <div>
            <dt>Contract</dt>
            <dd>
              <span title={ca}>{ca.length > 12 ? `${ca.slice(0, 6)}…${ca.slice(-4)}` : ca}</span>
              <button
                type="button"
                className="rx-wn-facts__copy"
                onClick={() => {
                  copy(ca);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                aria-label={copied ? "Contract address copied" : "Copy contract address"}
                title={copied ? "Copied" : "Copy contract address"}
              >
                {copied ? <IconCheck /> : <IconCopy />}
              </button>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

const IconTrend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Actions card (design report.html / whats-new.html .rail-actions): "Ask Claw about SYM" opens
 * Claw AI 5.0 (same as the header's link), then whichever of Open chart / What's New / Full
 * Report the caller can do. `onAction` runs after a click (the popup closes itself).
 */
export function TokenActionsCard({
  symbol,
  askClaw = true,
  chart = null,
  onWhatsNew = null,
  whatsNewBusy = false,
  onFullReport = null,
  onAction,
  className = "",
}: {
  symbol?: string | null;
  askClaw?: boolean;
  chart?: TokenChartAction | null;
  onWhatsNew?: (() => void) | null;
  whatsNewBusy?: boolean;
  onFullReport?: (() => void) | null;
  onAction?: () => void;
  className?: string;
}) {
  const sym = (symbol || "").replace(/^\$/, "").trim().toUpperCase();
  const showClaw = askClaw && !!sym;
  if (!showClaw && !chart && !onWhatsNew && !onFullReport) return null;
  return (
    <section className={`rx-raised rx-wn-actions ${className}`} aria-label="Actions">
      {showClaw ? (
        <Link
          className="rx-btn rx-btn--claw"
          href="/claw-v5"
          onClick={() => {
            markClawV5ScrollToInput();
            markClawV5Prefill(`What's the outlook for $${sym}? Price action, liquidity, holders and the main risks.`);
            onAction?.();
          }}
        >
          <img className="claw-ico" src="/images/claw-logo-96.webp" alt="" width={18} height={18} />
          <span>Ask Claw about {sym}</span>
        </Link>
      ) : null}
      {chart ? (
        <a
          className="rx-btn rx-btn--secondary"
          href={chart.href}
          onClick={(e) => {
            if (chart.onOpen?.()) e.preventDefault();
            onAction?.();
          }}
        >
          <IconTrend />
          Open chart
        </a>
      ) : null}
      {onWhatsNew ? (
        <button type="button" className="rx-btn rx-btn--news" onClick={onWhatsNew} disabled={whatsNewBusy}>
          {whatsNewBusy ? (
            <span className="rx-spin" aria-hidden="true" />
          ) : (
            <img className="rx-emo" src="/images/emoji/bolt.webp" alt="" width={16} height={16} />
          )}
          What&apos;s New
        </button>
      ) : null}
      {onFullReport ? (
        <button
          type="button"
          className="rx-btn rx-btn--report"
          onClick={() => {
            onFullReport();
            onAction?.();
          }}
        >
          <img className="rx-emo" src="/images/emoji/report.webp" alt="" width={16} height={16} />
          Full Report
        </button>
      ) : null}
    </section>
  );
}

/** "Recently generated" (design .rail-card .hist): the viewer's other saved reports + report history. */
export function RecentReportsCard({
  recent,
  onAction,
  className = "",
}: {
  recent: RecentReports;
  onAction?: () => void;
  className?: string;
}) {
  const titleId = useId();
  if (!recent.items.length) return null;
  return (
    <section className={`rx-raised rx-wn-recent ${className}`} aria-labelledby={titleId}>
      <h3 id={titleId}>Recently generated</h3>
      <ul>
        {recent.items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => {
                recent.onOpen(it.id);
                onAction?.();
              }}
            >
              <b>{it.title}</b>
              {it.detail ? <span>{it.detail}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {recent.onViewHistory ? (
        <button
          type="button"
          className="rx-btn rx-btn--ghost rx-btn--s"
          onClick={() => {
            recent.onViewHistory?.();
            onAction?.();
          }}
        >
          View report history
        </button>
      ) : null}
    </section>
  );
}

/** Per-update "Copy" (design whats-new.html .feed__foot): copies that update, says "Copied" for a moment. */
function CopyUpdateButton({ text, what }: { text: string; what: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <>
      <button
        type="button"
        className={`rx-btn rx-btn--ghost rx-btn--s rx-wn__copy${copied ? " is-done" : ""}`}
        onClick={() => {
          if (copy(text)) setCopied(true);
        }}
        aria-label={copied ? `${what} copied` : `Copy ${what}`}
      >
        {copied ? <IconCheck /> : <IconCopy />}
        <span aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
      </button>
      <span className="sr-only" role="status">
        {copied ? `${what} copied` : ""}
      </span>
    </>
  );
}

type UpdateKind = "all" | "summary" | "posts";
const UPDATE_KINDS: { key: UpdateKind; label: string }[] = [
  { key: "all", label: "All updates" },
  { key: "summary", label: "Summary" },
  { key: "posts", label: "Posts on X" },
];

export function WhatsNewModal({
  open,
  onClose,
  loading = false,
  error = null,
  result,
  fallbackLinks = null,
  imageUrl = null,
  symbol = null,
  trade = null,
  facts = null,
  actions = null,
  recent = null,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [kind, setKind] = useState<UpdateKind>("all");

  // every new read (or reopening) starts on "All updates"
  useEffect(() => {
    setKind("all");
  }, [open, result]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // keep focus inside the dialog
      const f = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input,[tabindex='0']"),
      ).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const lastFocus = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    };
  }, [open, onKeyDown]);

  if (!open || typeof document === "undefined") return null;

  const meta = result?.metadata;
  const ticker = (meta?.ticker || symbol || trade?.symbol || "").replace(/^\$/, "");
  const projectName = meta?.projectName || trade?.name || "";
  const logoSrc = meta?.imageUrl || imageUrl || trade?.logo || "";
  const links = meta?.links || fallbackLinks || undefined;
  const paragraphs = result ? paragraphsFromResult(result) : [];
  const updated = updatedLabel(meta?.generatedAt);
  const subtitle = loading
    ? "Reading the latest posts on X…"
    : result
      ? ["Mini-report from top posts on X", updated].filter(Boolean).join(" · ")
      : "Mini-report from top posts on X";

  const showFacts = hasFacts(facts);
  const actionsCard = (cls = "") => (
    <TokenActionsCard
      symbol={ticker}
      askClaw={!actions?.hideAskClaw}
      chart={actions?.chart ?? null}
      onFullReport={actions?.onFullReport ?? null}
      onAction={onClose}
      className={cls}
    />
  );
  const showActions = (!actions?.hideAskClaw && !!ticker) || !!actions?.chart || !!actions?.onFullReport;
  const showRecent = !!recent?.items.length;
  const hasRail = !!trade || showFacts || showActions || showRecent;
  // below 1024px (and without a rail) the cards follow the updates
  const factsInline = showFacts ? (
    <WhatsNewFactsCard facts={facts} className="rx-wn__facts-inline" />
  ) : null;
  const sideInline = (
    <>
      {factsInline}
      {showActions ? actionsCard("rx-wn__facts-inline") : null}
      {showRecent ? <RecentReportsCard recent={recent!} onAction={onClose} className="rx-wn__facts-inline" /> : null}
    </>
  );

  const tradeInline = trade ? (
    <WhatsNewTradeCard trade={trade} onClose={onClose} className="rx-wn__trade-inline" />
  ) : null;

  const tweets = result?.tweets ?? [];
  const showSummary = kind !== "posts";
  const showPosts = kind !== "summary";

  return createPortal(
    <div className="rx-wn">
      <button type="button" className="rx-wn__scrim" aria-label="Close What's New" tabIndex={-1} onClick={onClose} />
      <div
        ref={dialogRef}
        className={`rx-wn__modal${hasRail ? " rx-wn__modal--rail" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="rx-wn__head">
          <div className="rx-wn__id">
            <TokenAvatar src={logoSrc} symbol={ticker || projectName || "?"} className="rx-wn__ava" />
            <div className="min-w-0">
              <h2 id={titleId}>
                <img className="rx-emo" src="/images/emoji/bolt.webp" alt="" width={18} height={18} />
                <span>What&apos;s New{ticker ? ` · ${ticker}` : ""}</span>
              </h2>
              <p>{subtitle}</p>
            </div>
          </div>
          <div className="rx-wn__acts">
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rx-icon-btn rx-icon-btn--s"
              aria-label="Close What's New"
            >
              <IconClose />
            </button>
          </div>
        </div>

        <div className="rx-wn__body">
          <div className="rx-wn__main">
            {loading ? (
              <>
                <div className="rx-wn__state" role="status">
                  <img src={MASCOT} alt="" width={72} height={77} className="whats-new-mascot-bounce" />
                  <p>
                    We&apos;re digging into what the market is saying
                    <span className="whats-new-ellipsis" aria-hidden />
                  </p>
                </div>
                {tradeInline}
                {sideInline}
              </>
            ) : error ? (
              <>
                <div className="rx-wn__error" role="alert">
                  {error}
                </div>
                {tradeInline}
                {sideInline}
              </>
            ) : result ? (
              <>
                <p className="rx-wn__lead">
                  Here&apos;s the latest on{" "}
                  {projectName ? (
                    <>
                      <b>{projectName}</b>
                      {ticker && ticker.toLowerCase() !== projectName.toLowerCase() ? ` (${ticker})` : ""}
                    </>
                  ) : (
                    <b>{ticker || "this token"}</b>
                  )}
                  , from the top posts on X.
                </p>

                {/* phones and tablets: trade first, then the updates */}
                {tradeInline}

                {/* kind filter (design whats-new.html #newsChips): the two kinds this read has */}
                <div className="rx-wn__chips" role="group" aria-label="Filter updates">
                  {UPDATE_KINDS.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      className={`rx-chip${kind === k.key ? " is-active" : ""}`}
                      aria-pressed={kind === k.key}
                      onClick={() => setKind(k.key)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>

                {showSummary ? (
                  paragraphs.length ? (
                    <ol className="rx-wn__list" aria-label="Summary">
                      {paragraphs.map((p, i) => {
                        const head = p.title.replace(/\.*$/, ".");
                        return (
                          <li key={`${p.title}-${i}`} className="rx-wn__item rx-wn__item--point">
                            <img className="rx-wn__src" src="/images/emoji/bolt.webp" alt="" width={18} height={18} />
                            <p>
                              <b>{head}</b> {p.body}
                            </p>
                            <CopyUpdateButton text={`${head} ${p.body}`} what={`update “${p.title}”`} />
                          </li>
                        );
                      })}
                    </ol>
                  ) : kind === "summary" ? (
                    <p className="rx-wn__empty">No summary for {ticker || "this token"} yet.</p>
                  ) : null
                ) : null}

                {showPosts ? <h3 className="rx-wn__sub">Top posts on X</h3> : null}
                {!showPosts ? null : tweets.length === 0 ? (
                  <p className="rx-wn__empty">No recent posts found for this ticker right now.</p>
                ) : (
                  <ol className="rx-wn__list" aria-label="Top posts on X">
                    {tweets.map((t) => {
                      const age = compactAge(t.createdAt);
                      const pfp = t.tweeter.publicImageUrl;
                      const who = [t.tweeter.name, t.tweeter.username ? `@${t.tweeter.username}` : ""]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <li key={t.id || t.url || t.text.slice(0, 24)} className="rx-wn__item">
                          <img className="rx-wn__src" src={WN("x")} alt="" width={18} height={18} />
                          <div className="min-w-0">
                            <div className="rx-wn__by">
                              {pfp ? <img className="rx-wn__pfp" src={pfp} alt="" loading="lazy" /> : null}
                              <b>{t.tweeter.name || `@${t.tweeter.username}`}</b>
                              {t.tweeter.isBlueVerified ? <IconVerified /> : null}
                              {t.tweeter.username ? <span>@{t.tweeter.username}</span> : null}
                              {t.tweeter.followers > 0 ? (
                                <span className="rx-wn__fol">{formatCount(t.tweeter.followers)} followers</span>
                              ) : null}
                            </div>
                            <p className="rx-wn__text">{t.text}</p>
                            <div className="rx-wn__meta">
                              <span className="rx-wn__likes" aria-label={`${t.likeCount} likes`}>
                                <IconHeart />
                                {formatCount(t.likeCount)}
                              </span>
                              <span aria-label={`${t.retweetCount} reposts`}>
                                <IconRepost />
                                {formatCount(t.retweetCount)}
                              </span>
                              {t.viewCount > 0 ? (
                                <span aria-label={`${t.viewCount} views`}>
                                  <IconEye />
                                  {formatCount(t.viewCount)}
                                </span>
                              ) : null}
                              <CopyUpdateButton
                                text={[t.text, who ? `— ${who}` : "", t.url || ""].filter(Boolean).join("\n")}
                                what={t.tweeter.username ? `post by @${t.tweeter.username}` : "post"}
                              />
                            </div>
                          </div>
                          {t.url ? (
                            <a
                              className="rx-wn__open"
                              href={t.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open the post by @${t.tweeter.username} on X${age ? `, ${age} ago` : ""}`}
                            >
                              {age ? <time dateTime={parseDate(t.createdAt)?.toISOString()}>{age}</time> : null}
                              <IconExt />
                            </a>
                          ) : age ? (
                            <span className="rx-wn__open">
                              <time dateTime={parseDate(t.createdAt)?.toISOString()}>{age}</time>
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}

                <ul className="rx-wn__checks" aria-label="Project links">
                  {SOCIALS.map((s) => {
                    const href = links?.[s.key];
                    return (
                      <li key={s.key}>
                        {href ? (
                          <a className="rx-wn__check" href={href} target="_blank" rel="noopener noreferrer">
                            <img src={WN("check")} alt="" width={14} height={14} />
                            {s.label}
                            <IconExt size={10} />
                          </a>
                        ) : (
                          <span className="rx-wn__check">
                            <img src={WN("cross")} alt="" width={14} height={14} />
                            No {s.label} listed
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {sideInline}
              </>
            ) : null}
          </div>

          {hasRail ? (
            <div className="rx-wn__rail">
              {trade ? <WhatsNewTradeCard trade={trade} onClose={onClose} /> : null}
              {showFacts ? <WhatsNewFactsCard facts={facts} /> : null}
              {showActions ? actionsCard() : null}
              {showRecent ? <RecentReportsCard recent={recent!} onAction={onClose} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

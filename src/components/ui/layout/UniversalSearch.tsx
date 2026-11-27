"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  useTrendingTokens,
  type Chain,
  type TrendingToken,
} from "@/hooks/useTrendingTokens";
import {
  chainFromToken,
  hrefForScreenerChain,
  hrefForScreenerToken,
  isEvmContractAddress,
  isRexScreenerPathname,
  isSolanaMintAddress,
  parseRexScreenerPath,
  REX_SCREENER_ALL_HREF,
} from "@/lib/rexscreenerRoutes";
import { getRexmarketsDetailHref } from "@/lib/rexmarkets/marketRoutes";
import {
  REX_SCREENER_EXCHANGE_HREF,
  requestScreenerReports,
  screenerReportsHref,
  type ScreenerReportsType,
} from "@/components/ui/layout/shellActions";
import {
  markClawV5Prefill,
  markClawV5ScrollToInput,
} from "@/lib/clawV5/scrollIntent";
import {
  chainBadgeFor,
  monogramBackground,
  monogramOf,
  pct24h,
  pickVolume24h,
} from "@/app/(rexscreener)/_components/trendingtable/tablecontent/tokenMeta";
import { formatUsd } from "@/utils/format";
import "@/styles/pages/universal-search.css";

/**
 * Universal header search (design/js/universal.js, "Search tokens, markets or paste address", ⌘K).
 *
 * Wide headers: a field in the header; focusing it opens a dropdown (trending tokens + hot markets when
 * empty; tokens, prediction markets, pages and "Ask Claw" while typing). Narrow headers: an icon button
 * opens the same results in a full-screen sheet. ⌘K / Ctrl+K (and "/" outside text fields) opens it.
 *
 * Data (no mock data):
 *  - tokens: POST /api/trending search (Birdeye v3 across chains with chain "all", plus Robinhood Chain,
 *    which Birdeye does not cover); a pasted 0x… / Solana address runs an address search.
 *  - trending tokens: the RexScreener list (useTrendingTokens, same query as the list's first page).
 *  - prediction markets: the Rex Predictions list APIs (Kalshi, Polymarket, Limitless), merged by volume.
 */

/* ---------------- types ---------------- */

type SearchMode = "closed" | "dropdown" | "sheet";
type Venue = "Kalshi" | "Polymarket" | "Limitless";
type IconName =
  | "search"
  | "clock"
  | "list"
  | "swap"
  | "chevr"
  | "arrow"
  | "book"
  | "wallet"
  | "doc"
  | "trend";

type MarketHit = {
  key: string;
  title: string;
  category: string;
  venue: Venue;
  volume: number | null;
  href: string;
};

type PageAction = "exchange" | "orders" | "claw";
type PageDef = {
  key: string;
  title: string;
  sub: string;
  href: string;
  icon: IconName | "claw";
  action?: PageAction;
  /** Golden / Pump Reports: opens that view of the list (in place when it is on screen). */
  reports?: ScreenerReportsType;
  /** lower-case texts the query is matched against */
  haystack: string[];
};

type Option =
  | { kind: "token"; key: string; href: string; token: TrendingToken }
  | { kind: "market"; key: string; href: string; market: MarketHit }
  | { kind: "page"; key: string; href: string; page: PageDef }
  | { kind: "claw"; key: string; href: string; question: string };

type GroupState = "idle" | "loading" | "error" | "done";
type Group = {
  key: string;
  label: string;
  state: GroupState;
  options: Option[];
  skeleton: number;
  skeletonKind: "token" | "market";
};

type SearchPlan = {
  /** token search to run (null: none) */
  tokenType: "ticker" | "address" | null;
  tokenQuery: string;
  /** market search to run (null: none) */
  marketQuery: string | null;
  /** 0x… or base58 text: the empty state talks about contract addresses */
  looksAddress: boolean;
  fullAddress: boolean;
  tooShort: boolean;
};

/* ---------------- constants ---------------- */

const DEBOUNCE_MS = 250;
const MAX_TOKENS = 5;
const MAX_MARKETS = 4;
const MAX_PAGES = 3;
const TRENDING_TOKENS = 4;
const HOT_MARKETS = 3;
const PLACEHOLDER = "Search tokens, markets or paste address";
const FIELD_LABEL = "Search tokens, markets or pages";

/** RexScreener chain lists (the toolbar has no chain buttons: the search reaches every list). */
const SCREENER_CHAINS: {
  chain: Exclude<Chain, "all">;
  label: string;
  aliases: string[];
}[] = [
  { chain: "base", label: "Base", aliases: ["base"] },
  { chain: "solana", label: "Solana", aliases: ["solana", "sol"] },
  { chain: "ethereum", label: "Ethereum", aliases: ["ethereum", "eth"] },
  { chain: "bsc", label: "BNB Chain", aliases: ["bnb chain", "bnb", "bsc", "binance"] },
  { chain: "robinhood", label: "Robinhood", aliases: ["robinhood"] },
  { chain: "monad", label: "Monad", aliases: ["monad"] },
];

const ORDERS_HREF = "/rexmarkets?openPolymarketModal=true&ordersTab=positions";

function buildPages(screenerHref: string): PageDef[] {
  const page = (p: Omit<PageDef, "haystack">): PageDef => ({
    ...p,
    haystack: [`${p.title} ${p.sub}`.toLowerCase()],
  });
  return [
    page({ key: "screener", title: "RexScreener", sub: "Live token screener", href: screenerHref, icon: "list" }),
    ...SCREENER_CHAINS.map<PageDef>((c) => ({
      key: `screener-${c.chain}`,
      title: `RexScreener · ${c.label}`,
      sub: "Live token screener",
      href: hrefForScreenerChain(c.chain),
      icon: "list",
      // a chain list matches on its chain name ("sol", "solana", "bnb"…)
      haystack: [c.label.toLowerCase(), ...c.aliases],
    })),
    page({ key: "predictions", title: "Rex Predictions", sub: "Prediction markets", href: "/rexmarkets", icon: "clock" }),
    page({ key: "golden", title: "Golden Reports", sub: "AI reports", href: screenerReportsHref("golden"), icon: "doc", reports: "golden" }),
    page({ key: "pump", title: "Pump Reports", sub: "AI reports", href: screenerReportsHref("pump"), icon: "trend", reports: "pump" }),
    page({ key: "claw", title: "Claw AI 5.0", sub: "Chat with Claw", href: "/claw-v5", icon: "claw", action: "claw" }),
    page({ key: "exchange", title: "Enter the Exchange", sub: "Swap tokens", href: REX_SCREENER_EXCHANGE_HREF, icon: "swap", action: "exchange" }),
    page({ key: "orders", title: "My orders and positions", sub: "Kalshi and Polymarket", href: ORDERS_HREF, icon: "list", action: "orders" }),
    page({ key: "library", title: "Claw chats and Library", sub: "Claw AI 5.0", href: "/claw-v5/library", icon: "book" }),
    page({ key: "portfolio", title: "Portfolio and PNL", sub: "Holdings and profit and loss", href: "/portfolio", icon: "wallet" }),
  ];
}

/* ---------------- query planning ---------------- */

const TICKER_RE = /^[A-Za-z0-9][A-Za-z0-9\s\-_.]{0,78}$/;

function planSearch(raw: string): SearchPlan {
  const q = raw.trim();
  const none: SearchPlan = {
    tokenType: null,
    tokenQuery: "",
    marketQuery: null,
    looksAddress: false,
    fullAddress: false,
    tooShort: q.length > 0 && q.length < 2,
  };
  if (!q) return none;
  if (isEvmContractAddress(q) || isSolanaMintAddress(q)) {
    return { ...none, tokenType: "address", tokenQuery: q, looksAddress: true, fullAddress: true };
  }
  // part of an address: nothing to search until the whole address is pasted
  if (/^0x[0-9a-f]{6,}$/i.test(q)) return { ...none, looksAddress: true };
  if (q.length < 2) return none;
  const ticker = q.replace(/^\$/, "").trim();
  const tickerOk = ticker.length >= 2 && TICKER_RE.test(ticker);
  return {
    ...none,
    tokenType: tickerOk ? "ticker" : null,
    tokenQuery: tickerOk ? ticker : "",
    marketQuery: q,
  };
}

/* ---------------- data ---------------- */

function extractTokens(payload: unknown): TrendingToken[] {
  const p = payload as { items?: unknown; result?: unknown } | null;
  const rows = Array.isArray(p?.items)
    ? p.items
    : Array.isArray(p?.result)
      ? p.result
      : Array.isArray(payload)
        ? payload
        : [];
  return (rows as unknown[]).filter(
    (x): x is TrendingToken => !!x && typeof x === "object",
  );
}

/** A row we can link to: its address fits its chain (Birdeye's "all" search also returns chains
 *  RexScreener does not list, which the API labels as Solana). */
function tokenUsable(t: TrendingToken): boolean {
  const addr = (t.tokenAddress ?? "").trim();
  if (!addr) return false;
  return chainFromToken(t) === "solana"
    ? isSolanaMintAddress(addr)
    : isEvmContractAddress(addr);
}

function tokenKey(t: TrendingToken): string {
  const chain = chainFromToken(t);
  const addr = (t.tokenAddress ?? "").trim();
  return `tok:${chain}:${chain === "solana" ? addr : addr.toLowerCase()}`;
}

async function postTokenSearch(
  chain: Chain,
  query: string,
  type: "ticker" | "address",
  signal?: AbortSignal,
): Promise<TrendingToken[]> {
  const res = await fetch("/api/trending", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      limit: 10,
      offset: 0,
      chain,
      sort_by: "v24hUSD",
      sort_type: "desc",
      min_liquidity: 100,
      ui_amount_mode: "scaled",
      verified_only: chain === "solana",
      search_query: query,
      search_type: type,
    }),
  });
  if (!res.ok) throw new Error(`Token search failed (${res.status})`);
  return extractTokens(await res.json());
}

/** Ticker: every Birdeye chain at once ("all") plus Robinhood Chain. Address: "all" finds the chain. */
async function searchTokens(
  type: "ticker" | "address",
  query: string,
  signal?: AbortSignal,
): Promise<TrendingToken[]> {
  const chains: Chain[] = type === "address" ? ["all"] : ["all", "robinhood"];
  const settled = await Promise.allSettled(
    chains.map((c) => postTokenSearch(c, query, type, signal)),
  );
  if (settled.every((s) => s.status === "rejected")) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }
  const seen = new Set<string>();
  const rows: TrendingToken[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const t of s.value) {
      if (!tokenUsable(t)) continue;
      const k = tokenKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push(t);
    }
  }
  const q = query.toLowerCase();
  const exact = (t: TrendingToken) => ((t.symbol ?? "").toLowerCase() === q ? 0 : 1);
  return rows.sort(
    (a, b) =>
      exact(a) - exact(b) ||
      (pickVolume24h(b.totalVolume) ?? 0) - (pickVolume24h(a.totalVolume) ?? 0),
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Polymarket events carry a category or tags ({ label }); skip housekeeping tags. */
function polymarketCategory(m: any): string {
  const ev = m?.rawEventData;
  if (typeof ev?.category === "string" && ev.category.trim()) return ev.category.trim();
  const tags: any[] = Array.isArray(ev?.tags) ? ev.tags : [];
  const tag = tags.find(
    (t) => typeof t?.label === "string" && t.label.trim() && !/^(all|hide|featured|recurring)/i.test(t.label.trim()),
  );
  return tag ? String(tag.label).trim() : "";
}

function toMarketHits(venue: Venue, rows: any[]): MarketHit[] {
  const out: MarketHit[] = [];
  for (const m of rows) {
    if (!m || typeof m !== "object") continue;
    const title = String(m.title ?? "").trim();
    if (!title) continue;
    let href: string | null = null;
    let category = "";
    let volume: number | null = null;
    if (venue === "Kalshi") {
      href = getRexmarketsDetailHref({ ...m, _source: "kalshi" }, "kalshi");
      category = String(m.category ?? "").trim();
      volume = num(m.volume_24h) ?? num(m.volume);
    } else if (venue === "Polymarket") {
      if (m.closed === true || m.archived === true) continue;
      href = getRexmarketsDetailHref({ ...m, _source: "polymarket" }, "polymarket");
      category = polymarketCategory(m);
      volume = num(m.volume24hr) ?? num(m.volume);
    } else {
      if (m.closed === true || m.archived === true) continue;
      href = getRexmarketsDetailHref({ ...m, _source: "limitless" }, "limitless");
      category = String(m.subtitle ?? (Array.isArray(m.tags) ? m.tags[0] : "") ?? "").trim();
      volume = num(m.volume24hr) ?? num(m.volume);
    }
    if (!href) continue;
    out.push({ key: `mkt:${href}`, title, category, venue, volume, href });
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The Rex Predictions list's sources (Kalshi, Polymarket, Limitless), merged by volume like its "all" view.
 *  One venue failing does not fail the rest. */
async function fetchMarkets(query: string | null, signal?: AbortSignal): Promise<MarketHit[]> {
  const limit = "6";
  const q = query?.trim() || "";
  const reqs: [Venue, string][] = [
    ["Kalshi", `/api/kalshi/markets?${new URLSearchParams({ limit, status: "open", ...(q ? { query: q } : {}) })}`],
    [
      "Polymarket",
      `/api/polymarket/markets?${new URLSearchParams({
        limit,
        offset: "0",
        active: "true",
        archived: "false",
        closed: "false",
        order: "volume24hr",
        ascending: "false",
        ...(q ? { q } : {}),
      })}`,
    ],
    ["Limitless", `/api/limitless/markets?${new URLSearchParams({ limit, page: "1", ...(q ? { q } : {}) })}`],
  ];
  const settled = await Promise.allSettled(
    reqs.map(async ([venue, url]) => {
      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.ok) throw new Error(`${venue} markets failed (${res.status})`);
      const json = (await res.json()) as { markets?: unknown };
      return toMarketHits(venue, Array.isArray(json?.markets) ? json.markets : []);
    }),
  );
  if (settled.every((s) => s.status === "rejected")) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }
  const seen = new Set<string>();
  const all: MarketHit[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const m of s.value) {
      if (seen.has(m.key)) continue;
      seen.add(m.key);
      all.push(m);
    }
  }
  return all.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
}

/* ---------------- formatting ---------------- */

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** $1,830 · $0.4415 · $0.0₆1234 (tiny prices keep 4 significant digits without an exponent). */
function formatTokenPrice(v?: number): string | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 1) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (v >= 0.0001) {
    return `$${v.toLocaleString("en-US", { minimumSignificantDigits: 4, maximumSignificantDigits: 4 })}`;
  }
  const zeros = Math.ceil(-Math.log10(v)) - 1;
  const digits = String(Math.round(v * 10 ** (zeros + 4)))
    .slice(0, 4)
    .replace(/0+$/, "") || "0";
  const sub = String(zeros)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
  return `$0.0${sub}${digits}`;
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/* ---------------- icons (design sprite strokes) ---------------- */

const ICON_PATHS: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  swap: (
    <path d="M7 7h12l-3-3M17 17H5l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  chevr: <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  arrow: (
    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  book: (
    <path d="M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4zM5 16a4 4 0 014-4h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  ),
  doc: (
    <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  trend: (
    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  wallet: (
    <path
      d="M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 7l12-4v4M16 13.5h2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  ),
};

function Icon({ name, size }: { name: IconName; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

function ClawLogo({ size }: { size: number }) {
  return <img className="claw-ico" src="/images/claw-logo-96.webp" width={size} height={size} alt="" />;
}

/** Token logo when the API has one, otherwise initials on a stable muted colour (same rule as the screener). */
function TokenAvatar({ token }: { token: TrendingToken }) {
  const logo = typeof token.logo === "string" ? token.logo.trim() : "";
  const [failed, setFailed] = useState(false);
  const showLogo = !!logo && !failed;
  const label = token.symbol || token.name || "?";
  return (
    <span
      className="rx-avatar rx-avatar--token rx-us-ava"
      style={{
        background: showLogo
          ? "var(--rx-surface-3)"
          : monogramBackground(token.tokenAddress || label),
      }}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          className="rx-avatar__img"
          src={logo}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        monogramOf(label)
      )}
    </span>
  );
}

/* ---------------- result rows ---------------- */

function OptionRow({
  option,
  domId,
  active,
  q,
  onHover,
  onPick,
}: {
  option: Option;
  domId: string;
  active: boolean;
  q: string;
  onHover: (key: string) => void;
  onPick: (o: Option) => void;
}) {
  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    // new tab / window keeps the browser's own behaviour (the href is a real URL)
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onPick(option);
  };
  const common = {
    id: domId,
    role: "option" as const,
    "aria-selected": active,
    tabIndex: -1,
    href: option.href,
    onClick,
    onMouseMove: () => {
      if (!active) onHover(option.key);
    },
  };

  if (option.kind === "token") {
    const t = option.token;
    const symbol = (t.symbol || t.name || "Token").trim();
    const name = (t.name || "").trim();
    const chain = chainBadgeFor(t.chainId).label;
    const price = formatTokenPrice(t.usdPrice);
    const chg = pct24h(t.pricePercentChange);
    const hq = q.replace(/^\$/, "");
    return (
      <a {...common} className={clsx("rx-us-row", active && "is-active")}>
        <TokenAvatar token={t} />
        <span className="rx-us-main">
          <b>
            <Highlight text={symbol} q={hq} />
          </b>
          <span>
            {name ? (
              <>
                <Highlight text={name} q={hq} /> · {chain}
              </>
            ) : (
              chain
            )}
          </span>
        </span>
        {price || chg != null ? (
          <span className="rx-us-meta rx-num">
            {price ? <span>{price}</span> : null}
            {chg != null ? (
              <small className={chg >= 0 ? "up" : "down"}>
                <span aria-hidden="true">{chg >= 0 ? "▲" : "▼"}</span>
                <span className="sr-only">{chg >= 0 ? "up" : "down"}</span> {Math.abs(chg).toFixed(2)}%
              </small>
            ) : null}
          </span>
        ) : null}
      </a>
    );
  }

  if (option.kind === "market") {
    const m = option.market;
    return (
      <a {...common} className={clsx("rx-us-row", active && "is-active")}>
        <span className="rx-us-ico">
          <Icon name="clock" size={15} />
        </span>
        <span className="rx-us-main">
          <b>
            <Highlight text={m.title} q={q} />
          </b>
          <span>{m.category ? `${m.category} · ${m.venue}` : m.venue}</span>
        </span>
        {m.volume ? (
          <span className="rx-us-meta rx-num">
            <span>{formatUsd(m.volume)}</span>
            <small>Vol</small>
          </span>
        ) : null}
      </a>
    );
  }

  if (option.kind === "page") {
    const p = option.page;
    return (
      <a {...common} className={clsx("rx-us-row", active && "is-active")}>
        <span className="rx-us-ico">
          {p.icon === "claw" ? <ClawLogo size={16} /> : <Icon name={p.icon} size={15} />}
        </span>
        <span className="rx-us-main">
          <b>
            <Highlight text={p.title} q={q} />
          </b>
          <span>{p.sub}</span>
        </span>
        <Icon name="chevr" size={14} />
      </a>
    );
  }

  return (
    <a {...common} className={clsx("rx-us-row rx-us-row--claw", active && "is-active")}>
      <span className="rx-us-ico rx-us-ico--claw">
        <ClawLogo size={18} />
      </span>
      <span className="rx-us-main">
        <b>Ask Claw about “{option.question}”</b>
        <span>Get an AI answer in Claw AI 5.0</span>
      </span>
      <Icon name="arrow" size={14} />
    </a>
  );
}

function SkeletonRows({ count, kind }: { count: number; kind: "token" | "market" }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={clsx("rx-us-skel", kind === "market" && "rx-us-skel--market")}>
          <i className="rx-us-skel__ava" />
          <span className="rx-us-skel__main">
            <i />
            <i />
          </span>
          <i className="rx-us-skel__meta" />
        </div>
      ))}
    </div>
  );
}

/* ---------------- component ---------------- */

export default function UniversalSearch({
  onExchange,
  onOpenOrders,
}: {
  /** "Enter the Exchange": the page's swap panel (the Header's handler). */
  onExchange?: () => void;
  /** "My orders and positions": the Header's orders dialog. */
  onOpenOrders?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const uid = useId();
  const listboxId = `${uid}-listbox`;

  const fieldRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const [mode, setMode] = useState<SearchMode>("closed");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  /** Row picked with the arrows or the pointer, for the query it was picked in. */
  const [picked, setPicked] = useState<{ q: string; key: string } | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [shortcutLabel, setShortcutLabel] = useState("⌘K");

  const open = mode !== "closed";
  const qTrim = query.trim();
  const qNorm = qTrim.toLowerCase();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(qTrim), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [qTrim]);

  useEffect(() => {
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
    if (!mac) setShortcutLabel("Ctrl K");
  }, []);

  // A new page: close and start fresh
  const lastPathRef = useRef(pathname);
  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    setMode("closed");
    setQuery("");
  }, [pathname]);

  /* ----- data ----- */
  const planNow = useMemo(() => planSearch(qTrim), [qTrim]);
  const planDeb = useMemo(() => planSearch(debounced), [debounced]);
  const settledInput = qTrim === debounced;

  const onScreener = isRexScreenerPathname(pathname);
  const screenerChain: Exclude<Chain, "all"> = (() => {
    if (!onScreener) return "base";
    const c = parseRexScreenerPath(pathname).routeChain;
    return c === "all" ? "base" : c;
  })();

  // Empty query: the RexScreener list's own first page (shares its cache on screener pages)
  const trending = useTrendingTokens(
    { chain: screenerChain },
    { enabled: open && !qTrim },
  );
  const hotMarkets = useQuery({
    queryKey: ["universal-search", "hot-markets"],
    queryFn: ({ signal }) => fetchMarkets(null, signal),
    enabled: open && !qTrim,
    staleTime: 60_000,
    retry: false,
  });
  const tokenSearch = useQuery({
    queryKey: ["universal-search", "tokens", planDeb.tokenType, planDeb.tokenQuery],
    queryFn: ({ signal }) => searchTokens(planDeb.tokenType ?? "ticker", planDeb.tokenQuery, signal),
    enabled: open && planDeb.tokenType !== null,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
  const marketSearch = useQuery({
    queryKey: ["universal-search", "markets", planDeb.marketQuery?.toLowerCase() ?? ""],
    queryFn: ({ signal }) => fetchMarkets(planDeb.marketQuery, signal),
    enabled: open && planDeb.marketQuery !== null,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });

  const pages = useMemo(
    () => buildPages(onScreener ? hrefForScreenerChain(screenerChain) : REX_SCREENER_ALL_HREF),
    [onScreener, screenerChain],
  );

  const trendingRows = trending.data;
  const view = useMemo(() => {
    const groups: Group[] = [];
    const notes: string[] = [];
    let empty: { title: string; text: string } | null = null;
    let claw: Option | null = null;

    const tokenOption = (t: TrendingToken): Option => ({
      kind: "token",
      key: tokenKey(t),
      href: hrefForScreenerToken(chainFromToken(t), t.tokenAddress),
      token: t,
    });
    const marketOption = (m: MarketHit): Option => ({ kind: "market", key: m.key, href: m.href, market: m });

    if (!qTrim) {
      const trendState: GroupState = trending.isLoading
        ? "loading"
        : trending.isError && !trendingRows.length
          ? "error"
          : "done";
      const hotState: GroupState =
        hotMarkets.status === "pending" ? "loading" : hotMarkets.status === "error" ? "error" : "done";
      const top = trendingRows
        .filter(tokenUsable)
        .sort((a, b) => (pickVolume24h(b.totalVolume) ?? 0) - (pickVolume24h(a.totalVolume) ?? 0))
        .slice(0, TRENDING_TOKENS);
      groups.push({
        key: "tokens",
        label: "Trending tokens",
        state: trendState,
        options: top.map(tokenOption),
        skeleton: TRENDING_TOKENS,
        skeletonKind: "token",
      });
      groups.push({
        key: "markets",
        label: "Hot markets",
        state: hotState,
        options: (hotMarkets.data ?? []).slice(0, HOT_MARKETS).map(marketOption),
        skeleton: HOT_MARKETS,
        skeletonKind: "market",
      });
      if (trendState === "error" && hotState === "error") {
        empty = {
          title: "Search tokens, markets and pages",
          text: "The live lists couldn't load right now. Type a ticker or a market, or paste a contract address.",
        };
      } else {
        if (trendState === "error") notes.push("Trending tokens couldn't load right now.");
        if (hotState === "error") notes.push("Hot markets couldn't load right now.");
      }
    } else {
      const tokState: GroupState = !planNow.tokenType
        ? "idle"
        : !settledInput || tokenSearch.status === "pending"
          ? "loading"
          : tokenSearch.status === "error"
            ? "error"
            : "done";
      const mktState: GroupState = !planNow.marketQuery
        ? "idle"
        : !settledInput || marketSearch.status === "pending"
          ? "loading"
          : marketSearch.status === "error"
            ? "error"
            : "done";
      groups.push({
        key: "tokens",
        label: "Tokens",
        state: tokState,
        options: tokState === "done" ? (tokenSearch.data ?? []).slice(0, MAX_TOKENS).map(tokenOption) : [],
        skeleton: 2,
        skeletonKind: "token",
      });
      groups.push({
        key: "markets",
        label: "Prediction markets",
        state: mktState,
        options: mktState === "done" ? (marketSearch.data ?? []).slice(0, MAX_MARKETS).map(marketOption) : [],
        skeleton: 2,
        skeletonKind: "market",
      });
      const pageHits = pages.filter((p) => p.haystack.some((h) => h.includes(qNorm))).slice(0, MAX_PAGES);
      groups.push({
        key: "pages",
        label: "Pages",
        state: "done",
        options: pageHits.map<Option>((p) => ({ kind: "page", key: `pg:${p.key}`, href: p.href, page: p })),
        skeleton: 0,
        skeletonKind: "token",
      });
      claw = { kind: "claw", key: "claw", href: "/claw-v5", question: qTrim };

      if (tokState === "error") notes.push("Token search isn't available right now. Try again in a moment.");
      if (mktState === "error") notes.push("Market search isn't available right now. Try again in a moment.");
      const loading = tokState === "loading" || mktState === "loading";
      const found = groups.some((g) => g.state === "done" && g.options.length > 0);
      if (!loading && !found && !notes.length) {
        empty = planNow.tooShort
          ? { title: "Keep typing to search", text: "Type at least 2 characters, or paste a contract address." }
          : {
              title: `No tokens or markets match “${qTrim}”`,
              text: planNow.looksAddress
                ? planNow.fullAddress
                  ? "That looks like a contract address. It may not be listed on RexScreener yet."
                  : "That looks like part of a contract address. Paste the whole address to find the token."
                : "Check the ticker, or paste the contract address.",
            };
      }
    }

    const options: Option[] = [
      ...groups.flatMap((g) => (g.state === "done" ? g.options : [])),
      ...(claw ? [claw] : []),
    ];
    const loading = groups.some((g) => g.state === "loading");
    const resultCount = options.filter((o) => o.kind !== "claw").length;
    const status = !qTrim
      ? ""
      : loading
        ? "Searching…"
        : resultCount
          ? `${resultCount} result${resultCount === 1 ? "" : "s"}`
          : "No matches";
    return { groups, notes, empty, claw, options, status, loading };
  }, [
    qTrim,
    qNorm,
    planNow,
    settledInput,
    trending.isLoading,
    trending.isError,
    trendingRows,
    hotMarkets.status,
    hotMarkets.data,
    tokenSearch.status,
    tokenSearch.data,
    marketSearch.status,
    marketSearch.data,
    pages,
  ]);

  const { options, loading: searching } = view;
  const domIdOf = useCallback((i: number) => `${uid}-o${i}`, [uid]);
  const activeIndex = useMemo(() => {
    if (picked && picked.q === qNorm) {
      const i = options.findIndex((o) => o.key === picked.key);
      if (i >= 0) return i;
    }
    // while typing, the first result is ready for Enter (design); "Ask Claw" only once results are in
    if (!qNorm || !options.length) return -1;
    return searching && options[0].kind === "claw" ? -1 : 0;
  }, [picked, qNorm, options, searching]);
  const activeDomId = activeIndex >= 0 ? domIdOf(activeIndex) : undefined;

  /* ----- open / close ----- */
  const closeDropdown = useCallback(() => {
    setMode((m) => (m === "dropdown" ? "closed" : m));
  }, []);

  const openSheet = useCallback(() => {
    setQuery("");
    setPicked(null);
    setMode("sheet");
  }, []);

  const closeSheet = useCallback(() => {
    setMode("closed");
    window.requestAnimationFrame(() => btnRef.current?.focus());
  }, []);

  const pick = useCallback(
    (o: Option) => {
      setMode("closed");
      setQuery("");
      setPicked(null);
      inputRef.current?.blur();
      if (o.kind === "claw") {
        markClawV5ScrollToInput();
        markClawV5Prefill(o.question);
        // Claw reads the question when its welcome screen mounts; on that screen already, reload it
        if (pathname === "/claw-v5") window.location.assign("/claw-v5");
        else router.push("/claw-v5");
        return;
      }
      if (o.kind === "page") {
        if (o.page.action === "exchange" && onExchange) return onExchange();
        if (o.page.action === "orders" && onOpenOrders) return onOpenOrders();
        if (o.page.action === "claw") markClawV5ScrollToInput();
        if (o.page.reports && requestScreenerReports(o.page.reports)) return;
      }
      router.push(o.href);
    },
    [onExchange, onOpenOrders, pathname, router],
  );

  const move = useCallback(
    (delta: 1 | -1) => {
      if (!options.length) return;
      const next = activeIndex < 0 ? 0 : Math.min(options.length - 1, Math.max(0, activeIndex + delta));
      setPicked({ q: qNorm, key: options[next].key });
    },
    [options, activeIndex, qNorm],
  );

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>, inSheet: boolean) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!inSheet && mode !== "dropdown") {
        setMode("dropdown");
        return;
      }
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      // nothing highlighted: Ask Claw (design), unless results are still coming in
      const target = options[activeIndex] ?? (searching ? undefined : options.find((o) => o.kind === "claw"));
      if (target) pick(target);
    } else if (e.key === "Escape" && !inSheet) {
      e.preventDefault();
      setMode("closed");
      inputRef.current?.blur();
    }
  };

  const onFieldBlur = (e: ReactFocusEvent<HTMLInputElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && (panelRef.current?.contains(next) || fieldRef.current?.contains(next))) return;
    // switching windows / tabs keeps it open (focus comes back to the field)
    if (!document.hasFocus()) return;
    closeDropdown();
  };

  // click outside the field and the dropdown closes it
  useEffect(() => {
    if (mode !== "dropdown") return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (panelRef.current?.contains(t) || fieldRef.current?.contains(t))) return;
      closeDropdown();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [mode, closeDropdown]);

  // the dropdown hangs under the field, right edges aligned (design: universal.js pos())
  useLayoutEffect(() => {
    if (mode !== "dropdown") {
      setPos(null);
      return;
    }
    const field = fieldRef.current;
    if (!field) return;
    const place = () => {
      if (getComputedStyle(field).display === "none") {
        closeDropdown();
        return;
      }
      const r = field.getBoundingClientRect();
      const top = Math.round(r.bottom + 8);
      const right = Math.max(12, Math.round(document.documentElement.clientWidth - r.right));
      setPos((p) => (p && p.top === top && p.right === right ? p : { top, right }));
    };
    place();
    // follow the field while open: the header can move without resizing (the predictions bar above it
    // appears / collapses, a sidebar docks beside it), which no resize or scroll event reports
    let raf = 0;
    const follow = () => {
      place();
      raf = window.requestAnimationFrame(follow);
    };
    raf = window.requestAnimationFrame(follow);
    return () => window.cancelAnimationFrame(raf);
  }, [mode, closeDropdown]);

  // sheet: page behind does not scroll; focus the field
  useEffect(() => {
    if (mode !== "sheet") return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => sheetInputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(raf);
      body.style.overflow = prev;
    };
  }, [mode]);

  // keep the active row in view
  useEffect(() => {
    if (mode === "closed" || !activeDomId) return;
    document.getElementById(activeDomId)?.scrollIntoView({ block: "nearest" });
  }, [mode, activeDomId]);

  // ⌘K / Ctrl+K anywhere, "/" outside text fields: the field when it shows, the sheet otherwise
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      const slash = e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!cmdK && !slash) return;
      // working inside another dialog: leave it alone
      if (el?.closest('[aria-modal="true"]:not(.rx-us-sheet)')) return;
      e.preventDefault();
      const field = fieldRef.current;
      if (field && getComputedStyle(field).display !== "none") {
        inputRef.current?.focus();
        inputRef.current?.select();
        setMode("dropdown");
      } else if (modeRef.current !== "sheet") {
        openSheet();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSheet]);

  const onSheetKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key !== "Tab") return;
    // keep focus inside the sheet: field ⇄ Cancel
    const items = [sheetInputRef.current, cancelRef.current].filter(Boolean) as HTMLElement[];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length];
    next.focus();
  };

  const onHover = useCallback((key: string) => setPicked({ q: qNorm, key }), [qNorm]);

  /* ----- results (dropdown and sheet) ----- */
  const renderResults = (inSheet: boolean) => {
    let i = 0;
    const row = (o: Option) => {
      const index = i++;
      return (
        <OptionRow
          key={o.key}
          option={o}
          domId={domIdOf(index)}
          active={index === activeIndex}
          q={qNorm}
          onHover={onHover}
          onPick={pick}
        />
      );
    };
    return (
      <>
        <p className="sr-only" role="status" aria-live="polite">
          {view.status}
        </p>
        {view.notes.map((n) => (
          <p key={n} className="rx-us-note">
            {n}
          </p>
        ))}
        {view.empty ? (
          <div className="rx-us-empty">
            <Icon name="search" size={18} />
            <b>{view.empty.title}</b>
            <span>{view.empty.text}</span>
          </div>
        ) : null}
        <div role="listbox" id={listboxId} aria-label="Search results">
          {view.groups.map((g) => {
            if (g.state === "loading" && g.skeleton > 0) {
              return (
                <div key={g.key} className="rx-us-group" role="group" aria-label={g.label} aria-busy="true">
                  <span className="rx-us-label" aria-hidden="true">
                    {g.label}
                  </span>
                  <SkeletonRows count={g.skeleton} kind={g.skeletonKind} />
                </div>
              );
            }
            if (g.state !== "done" || !g.options.length) return null;
            const labelId = `${uid}-${g.key}-label`;
            return (
              <div key={g.key} className="rx-us-group" role="group" aria-labelledby={labelId}>
                <span className="rx-us-label" id={labelId}>
                  {g.label}
                </span>
                {g.options.map(row)}
              </div>
            );
          })}
          {view.claw ? row(view.claw) : null}
        </div>
        {inSheet ? null : (
          <div className="rx-us-foot" aria-hidden="true">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> to move
            </span>
            <span>
              <kbd>Enter</kbd> to open
            </span>
            <span>
              <kbd>Esc</kbd> to close
            </span>
          </div>
        )}
      </>
    );
  };

  const comboProps = (inSheet: boolean) => {
    const expanded = inSheet ? mode === "sheet" : mode === "dropdown";
    return {
      type: "search" as const,
      role: "combobox" as const,
      "aria-autocomplete": "list" as const,
      "aria-expanded": expanded,
      "aria-controls": expanded ? listboxId : undefined,
      "aria-activedescendant": expanded ? activeDomId : undefined,
      placeholder: PLACEHOLDER,
      autoComplete: "off",
      autoCorrect: "off",
      autoCapitalize: "off",
      spellCheck: false,
      enterKeyHint: "search" as const,
      value: query,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        if (!inSheet && mode === "closed") setMode("dropdown");
      },
      onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => onInputKeyDown(e, inSheet),
    };
  };

  return (
    <>
      <label ref={fieldRef} className={clsx("rx-input rx-us-field", mode === "dropdown" && "is-open")}>
        <Icon name="search" size={15} />
        <span className="sr-only">{FIELD_LABEL}</span>
        <input
          ref={inputRef}
          {...comboProps(false)}
          aria-keyshortcuts="Meta+K Control+K"
          onFocus={() => setMode((m) => (m === "sheet" ? m : "dropdown"))}
          onBlur={onFieldBlur}
        />
        <span className="rx-kbd" aria-hidden="true">
          {shortcutLabel}
        </span>
      </label>

      <button
        ref={btnRef}
        type="button"
        className="rx-icon-btn rx-us-btn"
        aria-label={FIELD_LABEL}
        aria-haspopup="dialog"
        aria-expanded={mode === "sheet"}
        onClick={openSheet}
      >
        <Icon name="search" size={18} />
      </button>

      {mode === "dropdown" && pos
        ? createPortal(
            <div
              ref={panelRef}
              className="rx-us-panel"
              style={{
                top: pos.top,
                right: pos.right,
                maxHeight: `min(560px, calc(100dvh - ${pos.top + 16}px))`,
              }}
              // keep focus in the field while rows are clicked
              onMouseDown={(e) => e.preventDefault()}
            >
              {renderResults(false)}
            </div>,
            document.body,
          )
        : null}

      {mode === "sheet"
        ? createPortal(
            <div className="rx-us-sheet" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onSheetKeyDown}>
              <div className="rx-us-sheet__bar">
                <label className="rx-input rx-us-sheet__field">
                  <Icon name="search" size={16} />
                  <span className="sr-only">{FIELD_LABEL}</span>
                  <input ref={sheetInputRef} {...comboProps(true)} />
                </label>
                <button ref={cancelRef} type="button" className="rx-btn rx-btn--ghost rx-btn--s" onClick={closeSheet}>
                  Cancel
                </button>
              </div>
              <div className="rx-us-panel rx-us-panel--sheet">{renderResults(true)}</div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

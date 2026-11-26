"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight, Check, ChevronDown, ChevronRight, Plus, Share, Wallet } from "lucide-react";
import RexHeader from "@/components/ui/layout/Header";
import Footer from "@/components/ui/layout/Footer";
import { AskClawFab } from "@/components/ui/AskClawFab";
import { requestShellAction } from "@/components/ui/layout/shellActions";
import { hrefForScreenerToken } from "@/lib/rexscreenerRoutes";
import { NATIVE_TOKEN_KEY, type PortfolioRange } from "@/lib/portfolio/types";
import { PortfolioChart } from "./PortfolioChart";
import { PnlShareDialog } from "./PnlShareDialog";
import {
  ALL_WALLETS,
  amtFmt,
  fmt,
  historyPools,
  holdingRows,
  pct,
  pnlUsd,
  priceFmt,
  totalsOf,
  usd,
  valueSeries,
  type HoldingRow,
} from "./portfolioMath";
import {
  usePortfolio,
  usePortfolioHistory,
  usePortfolioUser,
  usePortfolioWallets,
  type PfWallet,
} from "./usePortfolioData";
import "@/styles/pages/portfolio.css";

const RANGES: PortfolioRange[] = ["24H", "7D", "30D", "90D", "ALL"];
const COLORS = ["#FFC23D", "#5B8CFF", "#45E3A3", "#F5F3F0", "#B48CFF", "#FF8A5C", "#3DD6F5", "#FF7A7A", "#8A8988"];
const DUST_KEY = "rx-pf-dust";

/** WETH page for native ETH, since the screener lists contracts */
const tokenHref = (key: string) =>
  hrefForScreenerToken("base", key === NATIVE_TOKEN_KEY ? "0x4200000000000000000000000000000000000006" : key);

function TokenLogo({ row, size = 36 }: { row: HoldingRow; size?: number }) {
  const [broken, setBroken] = useState(false);
  const t = row.token;
  return (
    <span className="rx-avatar rx-avatar--token pf-logo" style={{ width: size, height: size }}>
      {t.logo && !broken ? (
        <Image src={t.logo} alt="" width={size} height={size} onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden="true">{t.symbol.slice(0, 2).toUpperCase()}</span>
      )}
      <span className="rx-avatar__chain pf-logo__chain" title="Base">
        <Image src="/images/brands/base.webp" alt="" width={12} height={12} />
      </span>
    </span>
  );
}

function PnlCell({ row }: { row: HoldingRow }) {
  if (row.pnl == null || row.pnlPct == null) {
    return <span className="td-muted" title="Not bought on RaptorX, so there is no cost to compare with">—</span>;
  }
  const cls = row.pnl >= 0 ? "up" : "down";
  return (
    <>
      <span className={`rx-num ${cls}`}>{pnlUsd(row.pnl)}</span>
      <small className={`rx-num ${cls}`}>{pct(row.pnlPct)}</small>
    </>
  );
}

export default function PortfolioView() {
  const { authenticated, ready, user, loading: userLoading } = usePortfolioUser();
  const wallets = usePortfolioWallets(user);
  const { linkWallet } = usePrivy();
  const { data, isLoading, isError, refetch, isFetching } = usePortfolio(wallets, user?.id ?? null);

  const [scope, setScope] = useState<string>(ALL_WALLETS);
  const [mode, setMode] = useState<"value" | "pnl">("value");
  const [range, setRange] = useState<PortfolioRange>("30D");
  const [hideDust, setHideDust] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [share, setShare] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DUST_KEY) === "0") setHideDust(false);
    } catch {
      /* storage blocked */
    }
  }, []);
  const toggleDust = (v: boolean) => {
    setHideDust(v);
    try {
      localStorage.setItem(DUST_KEY, v ? "1" : "0");
    } catch {
      /* storage blocked */
    }
  };

  // a wallet that disappears (unlinked) falls back to All wallets
  useEffect(() => {
    if (scope !== ALL_WALLETS && !wallets.some((w) => w.address === scope)) setScope(ALL_WALLETS);
  }, [wallets, scope]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const rows = useMemo(() => (data ? holdingRows(data, scope) : []), [data, scope]);
  const totals = useMemo(
    () =>
      data
        ? totalsOf(data, scope, rows)
        : { value: 0, day: 0, dayPct: null, costKnown: 0, unrealized: null, realized: null, total: null, totalPct: null, hasLedger: false },
    [data, scope, rows],
  );
  const pools = useMemo(() => historyPools(rows.map((r) => r.token)), [rows]);
  const history = usePortfolioHistory(pools, range, rows.length > 0);
  const nowSec = useMemo(
    () => Math.floor(Date.now() / 1000),
    // re-anchor "now" whenever fresh prices arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.updatedAt, history.data],
  );
  const points = useMemo(
    () => (rows.length ? valueSeries(rows, history.data?.series, range, nowSec) : []),
    [rows, history.data, range, nowSec],
  );

  const scopeWallet: PfWallet | undefined = wallets.find((w) => w.address === scope);
  const scopeLabel = scopeWallet?.label ?? "All wallets";
  const walletName = useCallback(
    (addrs: string[]) =>
      addrs.length > 1
        ? `${addrs.length} wallets`
        : (wallets.find((w) => w.address === addrs[0])?.label ?? "Wallet").replace(" Base wallet", ""),
    [wallets],
  );

  const visible = rows.filter((r) => !hideDust || (r.value ?? 0) >= 1);
  const top = rows.filter((r) => (r.value ?? 0) > 0).slice(0, 5);
  const rest = rows.slice(5).reduce((a, r) => a + (r.value ?? 0), 0);
  const parts: [string, number, string][] = [
    ...top.map((r, i): [string, number, string] => [`$${r.token.symbol}`, r.value ?? 0, COLORS[i]]),
    ...(rest > 0 ? [["Other", rest, COLORS[8]] as [string, number, string]] : []),
  ];
  const share100 = (v: number | null) => (totals.value > 0 && v != null ? (v / totals.value) * 100 : 0);

  const withCost = rows.filter((r) => r.avgCost != null && r.token.priceUsd != null);
  const best = withCost.length
    ? [...withCost].sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity))[0]
    : [...rows].filter((r) => r.token.change24h != null).sort((a, b) => (b.token.change24h ?? 0) - (a.token.change24h ?? 0))[0];
  const noLedger = "Trade on RaptorX to track it";
  const stats: { k: string; v: string; tone: "up" | "down" | ""; sub: string; subUp?: boolean }[] = [
    {
      k: "Total PNL",
      v: totals.total != null ? pnlUsd(totals.total) : "—",
      tone: totals.total == null ? "" : totals.total >= 0 ? "up" : "down",
      sub: totals.totalPct != null ? `${pct(totals.totalPct)} all time` : totals.hasLedger ? "From your RaptorX trades" : noLedger,
    },
    {
      k: "Unrealized",
      v: totals.unrealized != null ? pnlUsd(totals.unrealized) : "—",
      tone: totals.unrealized == null ? "" : totals.unrealized >= 0 ? "up" : "down",
      sub: "On what you hold now",
    },
    {
      k: "Realized",
      v: totals.realized != null ? pnlUsd(totals.realized) : "—",
      tone: totals.realized == null ? "" : totals.realized >= 0 ? "up" : "down",
      sub: "From closed trades",
    },
    {
      k: "Best performer",
      v: best ? `$${best.token.symbol}` : "—",
      tone: "",
      sub: best
        ? best.pnlPct != null && best.avgCost != null
          ? `${pct(best.pnlPct)} since you bought`
          : `${pct(best.token.change24h ?? 0)} today`
        : "",
      subUp: best ? (best.pnlPct ?? best.token.change24h ?? 0) >= 0 : undefined,
    },
  ];

  const signedOut = ready && !authenticated;
  const loadingAll = !signedOut && (userLoading || (wallets.length > 0 && isLoading));
  const noWallet = !signedOut && !userLoading && wallets.length === 0;
  const empty = !!data && rows.length === 0;

  const acts = (r: HoldingRow, big?: boolean) => (
    <div className="h-acts">
      <Link className="rx-btn rx-btn--secondary rx-btn--s" href={tokenHref(r.token.key)}>
        Trade
      </Link>
      <button
        className="rx-icon-btn panel-ctl"
        type="button"
        aria-label={`Share PNL for ${r.token.symbol}`}
        title="Share PNL"
        onClick={() => setShare(r.token.key)}
      >
        <Share className={big ? "size-[15px]" : "size-[13px]"} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="rx-pf-shell relative flex h-screen w-full flex-col overflow-hidden">
      <div className="shrink-0">
        <RexHeader />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <main className="rx-pf pf-page" id="main" aria-busy={loadingAll || undefined}>
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/base">RexScreener</Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span aria-current="page">Portfolio</span>
          </nav>

          <div className="page-head">
            <div className="page-head__title">
              <span className="rx-eyebrow">Account</span>
              <h1 className="pf-h1">Portfolio</h1>
              <p className="pf-lede">
                Live holdings on your RaptorX Base wallet and connected wallets, with profit and loss.
              </p>
            </div>
            {!signedOut ? (
              <div className="pf-tools">
                <div className="pf-wallet" ref={menuRef}>
                  <button
                    className="rx-btn rx-btn--secondary"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-controls="pfWalletMenu"
                    onClick={() => setMenuOpen((v) => !v)}
                    disabled={wallets.length === 0}
                  >
                    <Image src={scopeWallet?.logo ?? "/images/brands/base.webp"} alt="" width={18} height={18} className="pf-wallet__ico" />
                    <span>{scopeLabel}</span>
                    <ChevronDown className="size-3" aria-hidden="true" />
                  </button>
                  {menuOpen ? (
                    <div className="pf-menu" id="pfWalletMenu" role="menu">
                      {[{ address: ALL_WALLETS, label: "All wallets", logo: "/images/brands/base.webp", short: "" }, ...wallets].map(
                        (w) => (
                          <button
                            key={w.address}
                            className="pf-menu__item"
                            role="menuitemradio"
                            aria-checked={scope === w.address}
                            type="button"
                            onClick={() => {
                              setScope(w.address);
                              setMenuOpen(false);
                            }}
                          >
                            <Image className="pf-menu__logo" src={w.logo} alt="" width={20} height={20} />
                            {w.label}
                            {w.short ? <span className="rx-num pf-addr">{w.short}</span> : null}
                            <Check className="pf-menu__check size-3.5" aria-hidden="true" />
                          </button>
                        ),
                      )}
                      <hr />
                      <button
                        className="pf-menu__item"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          linkWallet();
                        }}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                        Connect another wallet
                      </button>
                    </div>
                  ) : null}
                </div>
                <button className="rx-btn rx-btn--secondary" type="button" onClick={() => requestShellAction("deposit")}>
                  <Wallet className="size-3.5" aria-hidden="true" />
                  Deposit
                </button>
                <button
                  className="rx-btn rx-btn--primary"
                  type="button"
                  onClick={() => setShare("ALL")}
                  disabled={rows.length === 0}
                >
                  <Share className="size-3.5" aria-hidden="true" />
                  Share PNL
                </button>
              </div>
            ) : null}
          </div>

          {signedOut ? (
            <section className="rx-raised pf-empty" aria-labelledby="pfSignedOut">
              <Wallet className="size-7 text-rx-gold" aria-hidden="true" />
              <h2 className="pf-h2" id="pfSignedOut">
                Log in to see your portfolio
              </h2>
              <p>Your RaptorX Base wallet and connected wallets, with live value and profit and loss.</p>
              <button className="rx-btn rx-btn--primary" type="button" onClick={() => requestShellAction("account")}>
                Log in
              </button>
            </section>
          ) : noWallet ? (
            <section className="rx-raised pf-empty" aria-labelledby="pfNoWallet">
              <Wallet className="size-7 text-rx-gold" aria-hidden="true" />
              <h2 className="pf-h2" id="pfNoWallet">
                No Base wallet yet
              </h2>
              <p>Connect a wallet to see its tokens here.</p>
              <button className="rx-btn rx-btn--primary" type="button" onClick={() => linkWallet()}>
                Connect a wallet
              </button>
            </section>
          ) : isError && !data ? (
            <section className="rx-raised pf-empty" role="alert">
              <h2 className="pf-h2">Couldn&apos;t load your portfolio</h2>
              <p>Prices or balances didn&apos;t load. Try again in a moment.</p>
              <button className="rx-btn rx-btn--secondary" type="button" onClick={() => refetch()} disabled={isFetching}>
                Try again
              </button>
            </section>
          ) : (
            <>
              <section className="pf-top">
                <div className="rx-raised pf-hero" aria-labelledby="pfValueLbl">
                  <div className="pf-hero__head">
                    <div>
                      <span className="pf-k" id="pfValueLbl">
                        Total value
                      </span>
                      {loadingAll ? (
                        <div className="rx-skel pf-total-skel" />
                      ) : (
                        <div className="pf-total rx-num">{usd(totals.value)}</div>
                      )}
                      <div className="pf-delta">
                        {!loadingAll && rows.length ? (
                          <>
                            <span className={`rx-num ${totals.day >= 0 ? "up" : "down"}`}>
                              {pnlUsd(totals.day)}
                              {totals.dayPct != null ? ` (${pct(totals.dayPct)})` : ""}
                            </span>
                            <span>today</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="pf-hero__ctl">
                      <div className="rx-seg" role="group" aria-label="Chart shows">
                        {(["value", "pnl"] as const).map((m) => (
                          <button
                            key={m}
                            className={`rx-seg__item${mode === m ? " is-active" : ""}`}
                            type="button"
                            aria-pressed={mode === m}
                            onClick={() => setMode(m)}
                          >
                            {m === "value" ? "Value" : "PNL"}
                          </button>
                        ))}
                      </div>
                      <div className="rx-seg" role="group" aria-label="Range">
                        {RANGES.map((r) => (
                          <button
                            key={r}
                            className={`rx-seg__item${range === r ? " is-active" : ""}`}
                            type="button"
                            aria-pressed={range === r}
                            onClick={() => setRange(r)}
                          >
                            {r === "ALL" ? "All" : r}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <PortfolioChart points={points} mode={mode} range={range} loading={loadingAll || history.isLoading} />
                  <p className="pf-note">
                    Value of what you hold now at each point in time{mode === "pnl" ? ", as the change since the start of the range" : ""}.
                  </p>
                </div>

                <div className="pf-side">
                  <dl className="pf-stats">
                    {stats.map((s) => (
                      <div key={s.k} className="rx-raised">
                        <dt>{s.k}</dt>
                        <dd className={`rx-num ${s.tone}`}>{loadingAll ? "…" : s.v}</dd>
                        <small className={s.subUp === true ? "up" : s.subUp === false ? "down" : ""}>{loadingAll ? "" : s.sub}</small>
                      </div>
                    ))}
                  </dl>
                  <div className="rx-raised pf-alloc">
                    <div className="pf-alloc__head">
                      <span className="pf-k">Allocation</span>
                      <span className="pf-k rx-num">{rows.length ? `${rows.length} token${rows.length === 1 ? "" : "s"}` : ""}</span>
                    </div>
                    <div
                      className="pf-alloc__bar"
                      role="img"
                      aria-label={
                        parts.length
                          ? `Allocation by token: ${parts.map(([s, v]) => `${s} ${fmt(share100(v), 1)}%`).join(", ")}`
                          : "No allocation yet"
                      }
                    >
                      {parts.map(([s, v, c]) => (
                        <i key={s} style={{ flex: v, background: c }} title={`${s} ${fmt(share100(v), 1)}%`} />
                      ))}
                    </div>
                    <ul className="pf-alloc__list">
                      {parts.map(([s, v, c]) => (
                        <li key={s}>
                          <i style={{ background: c }} />
                          <span>{s}</span>
                          <b className="rx-num">{fmt(share100(v), 1)}%</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section className="rx-raised board dt pf-board" aria-labelledby="pfHoldTitle">
                <div className="dt-bar">
                  <h2 className="pf-h2" id="pfHoldTitle">
                    Holdings
                  </h2>
                  <div className="dt-bar__right">
                    <label className="pf-dust">
                      <input type="checkbox" checked={hideDust} onChange={(e) => toggleDust(e.target.checked)} /> Hide
                      balances under $1
                    </label>
                  </div>
                </div>
                {loadingAll ? (
                  <div className="pf-skel-list" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="rx-skel" />
                    ))}
                  </div>
                ) : empty || visible.length === 0 ? (
                  <div className="pf-none">
                    <p>
                      {empty
                        ? "No tokens on Base in this wallet yet."
                        : "Only balances under $1 here. Untick “Hide balances under $1” to see them."}
                    </p>
                    {empty ? (
                      <button className="rx-btn rx-btn--primary rx-btn--s" type="button" onClick={() => requestShellAction("deposit")}>
                        Deposit
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="board__scroll">
                    <table className="h-table pf-table">
                      <thead>
                        <tr>
                          <th>Token</th>
                          <th>Balance</th>
                          <th>Price</th>
                          <th>24h</th>
                          <th>Value</th>
                          <th>Avg cost</th>
                          <th>PNL</th>
                          <th>Allocation</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((r) => {
                          const c = r.token.change24h;
                          return (
                            <tr key={r.token.key}>
                              <td>
                                <Link className="h-name" href={tokenHref(r.token.key)}>
                                  <TokenLogo row={r} />
                                  <span>
                                    <b>${r.token.symbol}</b>
                                    <small>
                                      {r.token.name ? `${r.token.name} · ` : ""}
                                      {walletName(r.wallets)}
                                    </small>
                                  </span>
                                </Link>
                              </td>
                              <td className="rx-num">{amtFmt(r.amount)}</td>
                              <td className="rx-num">{r.token.priceUsd != null ? priceFmt(r.token.priceUsd) : "—"}</td>
                              <td className={`rx-num ${c == null ? "td-muted" : c >= 0 ? "up" : "down"}`}>{c != null ? pct(c) : "—"}</td>
                              <td className="rx-num pf-strong">{r.value != null ? usd(r.value) : "—"}</td>
                              <td className="rx-num td-muted">{r.avgCost != null ? priceFmt(r.avgCost) : "—"}</td>
                              <td className="pf-pnl">
                                <PnlCell row={r} />
                              </td>
                              <td>
                                <span className="pf-meter">
                                  <i style={{ width: `${share100(r.value).toFixed(1)}%` }} />
                                </span>
                                <span className="rx-num td-muted pf-meter__n">{fmt(share100(r.value), 1)}%</span>
                              </td>
                              <td>{acts(r)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <ul className="h-list rc-list" aria-label="Holdings">
                      {visible.map((r) => {
                        const c = r.token.change24h;
                        return (
                          <li key={r.token.key} className="rc">
                            <div className="rc__head">
                              <Link className="h-name rc__name" href={tokenHref(r.token.key)}>
                                <TokenLogo row={r} size={40} />
                                <span>
                                  <b>${r.token.symbol}</b>
                                  <small>
                                    {amtFmt(r.amount)} · {r.token.priceUsd != null ? priceFmt(r.token.priceUsd) : "—"}
                                  </small>
                                </span>
                              </Link>
                              <span className="pf-rc__v">
                                <b className="rx-num">{r.value != null ? usd(r.value) : "—"}</b>
                                {c != null ? <small className={`rx-num ${c >= 0 ? "up" : "down"}`}>{pct(c)} 24h</small> : null}
                              </span>
                            </div>
                            <dl className="rc__stats">
                              <div>
                                <dt>Avg cost</dt>
                                <dd className="rx-num">{r.avgCost != null ? priceFmt(r.avgCost) : "—"}</dd>
                              </div>
                              <div>
                                <dt>PNL</dt>
                                <dd className="pf-pnl">
                                  <PnlCell row={r} />
                                </dd>
                              </div>
                              <div>
                                <dt>Allocation</dt>
                                <dd className="rx-num">{fmt(share100(r.value), 1)}%</dd>
                              </div>
                            </dl>
                            <div className="rc__foot">{acts(r, true)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>

              {/* My orders needs the Rex Predictions trading context: the Header opens it there from this URL */}
              <Link className="rx-raised pf-pm" href="/rexmarkets?openPolymarketModal=true&ordersTab=positions">
                <span className="pf-pm__logos">
                  <Image src="/images/brands/kalshi.webp" alt="" width={28} height={28} />
                  <Image src="/images/brands/polymarket.webp" alt="" width={28} height={28} />
                </span>
                <span className="pf-pm__t">
                  <b>Prediction positions</b>
                  <small>Kalshi, Polymarket, Limitless, Myriad and Predict.fun positions live in My orders.</small>
                </span>
                <span className="pf-pm__go">
                  My orders and positions
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            </>
          )}
        </main>
        <Footer />
      </div>

      <AskClawFab />

      <PnlShareDialog
        open={share != null}
        initialScope={share ?? "ALL"}
        onClose={() => setShare(null)}
        rows={rows}
        totals={totals}
        scopeLabel={scopeLabel}
        user={user}
      />
    </div>
  );
}

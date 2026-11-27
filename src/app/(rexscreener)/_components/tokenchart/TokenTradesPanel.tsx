"use client";

/**
 * The panel under the token chart (design/token.html "Recent trades": Trades / Top traders / Holders /
 * Liquidity). Trades and Liquidity come from GeckoTerminal's free API; Top traders and Holders have no
 * free source, so those tabs are left out.
 */

import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPoolTrades,
  fetchTokenPools,
  gtPoolUrl,
  type PoolTrade,
} from "@/lib/api/geckoterminal";
import { formatUsd } from "@/utils/format";
import { formatPrice } from "./priceFormat";

type Tab = "trades" | "liquidity";

type Props = {
  network: string;
  pool: string;
  token: string;
  symbol: string;
};

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const usd2 = (v: number) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "–";

function amount(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return v.toFixed(2);
  return formatPrice(v);
}

/** Re-render every few seconds so "7s ago" keeps counting. */
function useNow(ms: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, on]);
  return now;
}

function Note({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className="rx-tk__note" role="status">
      {busy ? <span className="rx-spin text-rx-gold" aria-hidden /> : null}
      <span>{children}</span>
    </div>
  );
}

function TradesTable({ rows, symbol, now }: { rows: PoolTrade[]; symbol: string; now: number }) {
  return (
    <table className="rx-tk__table rx-tk__table--trades">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Type</th>
          <th scope="col">USD</th>
          <th scope="col">{symbol}</th>
          <th scope="col">Price</th>
          <th scope="col">Trader</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td title={new Date(t.at).toLocaleString()}>{ago(t.at, now)}</td>
            <td className={t.side === "buy" ? "is-up" : "is-down"}>
              {t.side === "buy" ? "Buy" : "Sell"}
            </td>
            <td>{usd2(t.usd)}</td>
            <td>{amount(t.amount)}</td>
            <td>${formatPrice(t.price)}</td>
            <td title={t.trader}>{t.trader.slice(-6)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function TokenTradesPanel({ network, pool, token, symbol }: Props) {
  const [tab, setTab] = useState<Tab>("trades");
  const now = useNow(5000, tab === "trades");

  const trades = useQuery({
    queryKey: ["gt-trades", network, pool, token],
    queryFn: ({ signal }) => fetchPoolTrades(network, pool, token, signal),
    enabled: tab === "trades",
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
  const pools = useQuery({
    queryKey: ["gt-pools", network, token],
    queryFn: ({ signal }) => fetchTokenPools(network, token, signal),
    enabled: tab === "liquidity",
    staleTime: 300_000,
    retry: 1,
  });

  const samePool = (a: string) =>
    pool.startsWith("0x") ? a.toLowerCase() === pool.toLowerCase() : a === pool;

  let body: ReactNode;
  if (tab === "trades") {
    if (trades.isPending) body = <Note busy>Loading trades…</Note>;
    else if (trades.isError) body = <Note>Trades are unavailable right now.</Note>;
    else if (!trades.data.length) body = <Note>No trades in the last 24 hours.</Note>;
    else body = <TradesTable rows={trades.data.slice(0, 100)} symbol={symbol} now={now} />;
  } else if (pools.isPending) body = <Note busy>Loading pools…</Note>;
  else if (pools.isError) body = <Note>Pools are unavailable right now.</Note>;
  else if (!pools.data.length) body = <Note>No pools found.</Note>;
  else
    body = (
      <table className="rx-tk__table">
        <thead>
          <tr>
            <th scope="col">Pool</th>
            <th scope="col">DEX</th>
            <th scope="col">Liquidity</th>
            <th scope="col">Volume 24h</th>
          </tr>
        </thead>
        <tbody>
          {pools.data.map((p) => {
            const current = samePool(p.address);
            return (
              <tr key={p.address} className={clsx(current && "is-current")}>
                <td>
                  <a href={gtPoolUrl(network, p.address)} target="_blank" rel="noopener noreferrer">
                    {p.name || p.address.slice(0, 8)}
                  </a>
                  {current ? <span className="rx-tk__tag">Chart</span> : null}
                </td>
                <td>{p.dex}</td>
                <td>{formatUsd(p.liquidityUsd)}</td>
                <td>{formatUsd(p.volume24h)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );

  return (
    <section className="rx-tk__trades" aria-label="Recent trades">
      <div className="rx-tk__head">
        <div className="rx-seg rx-seg--mono" role="group" aria-label="Trade data">
          {(["trades", "liquidity"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={clsx("rx-seg__item", tab === k && "is-active")}
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
            >
              {k === "trades" ? "Trades" : "Liquidity"}
            </button>
          ))}
        </div>
        <a
          className="rx-eyebrow"
          href={gtPoolUrl(network, pool)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Data by GeckoTerminal
        </a>
      </div>
      <div className="rx-tk__tbody">{body}</div>
    </section>
  );
}

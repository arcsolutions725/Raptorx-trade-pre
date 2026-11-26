/* eslint-disable @typescript-eslint/no-explicit-any */

import { DexScreenerPair } from "@/lib/api/dexscreener";
import copy from "copy-to-clipboard";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import "@/styles/pages/analytics.css";

/* Styles: styles/pages/analytics.css (.rx-an …), prototype design/report.html "Market data". */

function PercentBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const tone = clamped >= 60 ? "is-up" : clamped >= 40 ? "is-gold" : "is-down";
  return (
    <li className="an-row">
      <div className="an-row__top">
        <span className="an-row__label" title={label}>
          {label}
        </span>
        <span className="an-row__val">{clamped.toFixed(0)}%</span>
      </div>
      <div className="an-bar" aria-hidden="true">
        <span className={tone} style={{ width: `${clamped}%` }} />
      </div>
    </li>
  );
}

const COPY_FEEDBACK_DURATION = 500;

function CopyReportButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copy(address);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  }, [address]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`rx-icon-btn an-copy${copied ? " is-done" : ""}`}
      title={copied ? "Copied!" : "Copy Report"}
      aria-label={copied ? "Copied!" : "Copy Report"}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </button>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
    </svg>
  );
}

export function CoinOMetry({ dexData }: { dexData?: DexScreenerPair }) {
  if (!dexData) {
    return (
      <div className="rx-an rx-an--w">
        <div className="an-empty">
          <ChartIcon />
          <p>No DexScreener data available</p>
        </div>
      </div>
    );
  }

  // ---------- small helpers ----------
  const fmtMoneyCompact = (n: number) => {
    if (!Number.isFinite(n)) return "N/A";
    return n >= 1_000_000_000
      ? `$${(n / 1_000_000_000).toFixed(2)}B`
      : n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : n >= 1_000
      ? `$${(n / 1_000).toFixed(2)}K`
      : `$${n.toFixed(2)}`;
  };

  const short = (s?: string, left = 4, right = 4) =>
    s && s.length > left + right
      ? `${s.slice(0, left)}…${s.slice(-right)}`
      : s ?? "";

  const dexLabel = (dexData.dexId || "").replace(/^\w/, (c) => c.toUpperCase());
  const pairSymbol = `${(dexData.baseToken?.symbol || "").toUpperCase()}/${(
    dexData.quoteToken?.symbol || ""
  ).toUpperCase()}`;
  const chain = (dexData.chainId || "").toLowerCase();
  const pairUrl =
    dexData.url ||
    (dexData.pairAddress
      ? `https://dexscreener.com/${chain}/${dexData.pairAddress}`
      : undefined);

  const tfs: Array<{ key: "m5" | "h1" | "h6" | "h24"; label: string }> = [
    { key: "m5", label: "5m" },
    { key: "h1", label: "1h" },
    { key: "h6", label: "6h" },
    { key: "h24", label: "24h" },
  ];

  // ---------- datasets ----------
  const buyRatios = tfs
    .map(({ key, label }) => {
      const bucket = dexData.txns?.[key];
      if (!bucket) return null;
      const total = (bucket.buys ?? 0) + (bucket.sells ?? 0);
      const ratio = total > 0 ? (bucket.buys / total) * 100 : 0;
      return { label: `Buy ratio ${label}`, value: ratio };
    })
    .filter(Boolean) as Array<{ label: string; value: number }>;

  const priceChanges = tfs
    .map(({ key, label }) => {
      const v = (dexData.priceChange as any)?.[key];
      if (typeof v !== "number") return null;
      const abs = Math.min(100, Math.max(0, Math.abs(v))); // use magnitude for bar width
      const signedLabel = `Price Δ ${label} (${v >= 0 ? "+" : ""}${v.toFixed(
        2
      )}%)`;
      return { label: signedLabel, value: abs };
    })
    .filter(Boolean) as Array<{ label: string; value: number }>;

  const volumes = tfs
    .map(({ key, label }) => {
      const v = (dexData.volume as any)?.[key];
      if (typeof v !== "number") return null;
      return { label: `Volume ${label}`, value: v };
    })
    .filter(Boolean) as Array<{ label: string; value: number }>;

  const statTiles: Array<{ label: string; value: string }> = [];
  if (dexData.liquidity?.usd != null) {
    statTiles.push({
      label: "Liquidity",
      value: fmtMoneyCompact(dexData.liquidity.usd),
    });
  }
  if (typeof dexData.fdv === "number") {
    statTiles.push({ label: "FDV", value: fmtMoneyCompact(dexData.fdv) });
  }
  if (typeof dexData.marketCap === "number") {
    statTiles.push({
      label: "Market cap",
      value: fmtMoneyCompact(dexData.marketCap),
    });
  }

  return (
    <div className="rx-an rx-an--w">
      {/* ---------- Pair: DEX + pair + link · chain + address + copy ---------- */}
      <div className="an-card an-pair">
        <div className="an-pair__id">
          {dexLabel && (
            <span className="rx-badge rx-badge--neutral">{dexLabel}</span>
          )}

          <span className="an-pair__sym">{pairSymbol}</span>

          {pairUrl && (
            <a
              href={pairUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="an-link"
              title="Open in DexScreener"
            >
              View pair
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          )}
        </div>

        <div className="an-pair__addr">
          {chain && (
            <span className="rx-badge rx-badge--neutral an-cap">{chain}</span>
          )}

          {dexData.pairAddress && (
            <code className="an-addr" title={dexData.pairAddress}>
              {short(dexData.pairAddress)}
            </code>
          )}

          {dexData.pairAddress && (
            <CopyReportButton address={dexData.pairAddress} />
          )}
        </div>
      </div>

      {/* ---------- Market stats ---------- */}
      {statTiles.length > 0 && (
        <section className="an-block">
          <h3 className="an-h">Market stats</h3>
          <div className="an-stats an-stats--3">
            {statTiles.map(({ label, value }) => (
              <div key={label} className="rx-well an-stat">
                <span className="an-stat__label" title={label}>
                  {label}
                </span>
                <span className="an-stat__value">{value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Volume ---------- */}
      {volumes.length > 0 && (
        <section className="an-block">
          <h3 className="an-h">Volume</h3>
          <div className="an-stats an-stats--4">
            {volumes.map(({ label, value }) => (
              <div key={label} className="rx-well an-stat">
                <span className="an-stat__label" title={label}>
                  {label}
                </span>
                <span className="an-stat__value">{fmtMoneyCompact(value)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(buyRatios.length > 0 || priceChanges.length > 0) && (
        <div className="an-duo">
          {/* ---------- Order flow ---------- */}
          {buyRatios.length > 0 && (
            <section className="an-block">
              <h3 className="an-h">Order flow (buys vs sells)</h3>
              <ul className="an-card an-rows">
                {buyRatios.map(({ label, value }) => (
                  <PercentBar key={label} label={label} value={value} />
                ))}
              </ul>
            </section>
          )}

          {/* ---------- Price change ---------- */}
          {priceChanges.length > 0 && (
            <section className="an-block">
              <h3 className="an-h">Price change</h3>
              <ul className="an-card an-rows">
                {priceChanges.map(({ label, value }) => (
                  <PercentBar key={label} label={label} value={value} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

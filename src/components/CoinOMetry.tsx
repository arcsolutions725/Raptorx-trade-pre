/* eslint-disable @typescript-eslint/no-explicit-any */

import { DexScreenerPair } from "@/lib/api/dexscreener";
import copy from "copy-to-clipboard";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

function PercentBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="rounded-lg bg-black/30 border border-white/10 p-2 sm:p-3">
      <div className="flex items-center justify-between mb-1.5 sm:mb-2 gap-2">
        <div
          className="text-[11px] sm:text-xs text-white/70 truncate"
          title={label}
        >
          {label}
        </div>
        <div className="text-[11px] sm:text-xs text-white/80 font-semibold tabular-nums">
          {clamped.toFixed(0)}%
        </div>
      </div>
      <div className="h-1.5 sm:h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full ${
            clamped >= 60
              ? "bg-green-400"
              : clamped >= 40
              ? "bg-yellow-400"
              : "bg-red-400"
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
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
      onClick={handleCopy}
      className="ml-auto p-1 rounded transition relative z-50"
      title={copied ? "Copied!" : "Copy Report"}
      aria-label={copied ? "Copied!" : "Copy Report"}
    >
      {copied ? (
        <Check className="w-5 h-5 text-white transition-transform" />
      ) : (
        <Copy className="w-5 h-5 text-white transition-transform" />
      )}
    </button>
  );
}

export function CoinOMetry({ dexData }: { dexData?: DexScreenerPair }) {
  if (!dexData) {
    return (
      <div className="text-center py-8 text-white/60">
        <div className="text-3xl mb-2">📊</div>
        <p>No DexScreener data available</p>
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
      return { label: `Buy Ratio ${label}`, value: ratio };
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
      label: "Liquidity (USD)",
      value: fmtMoneyCompact(dexData.liquidity.usd),
    });
  }
  if (typeof dexData.fdv === "number") {
    statTiles.push({ label: "FDV", value: fmtMoneyCompact(dexData.fdv) });
  }
  if (typeof dexData.marketCap === "number") {
    statTiles.push({
      label: "Market Cap",
      value: fmtMoneyCompact(dexData.marketCap),
    });
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ---------- Header row ---------- */}
      <div className="rounded-lg bg-black/30 border border-white/10 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          {/* Left block: DEX + Pair + Link */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* DEX tag */}
            {dexLabel && (
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] sm:text-xs text-white/80">
                {dexLabel}
              </span>
            )}

            {/* Pair symbol */}
            <div className="text-sm sm:text-base font-semibold text-white tabular-nums">
              {pairSymbol}
            </div>

            {/* View link */}
            {pairUrl && (
              <a
                href={pairUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] sm:text-xs text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
                title="Open in DexScreener"
              >
                View pair
                <svg
                  viewBox="0 0 24 24"
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                </svg>
              </a>
            )}
          </div>

          {/* Right block: Chain + Address + Copy */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {chain && (
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] sm:text-xs text-white/70 capitalize">
                {chain}
              </span>
            )}

            {dexData.pairAddress && (
              <code
                className="text-[11px] sm:text-xs text-white/70 bg-white/5 px-2 py-0.5 rounded"
                title={dexData.pairAddress}
              >
                {short(dexData.pairAddress)}
              </code>
            )}

            {dexData.pairAddress && (
              // <button
              //   onClick={copyPair}
              //   className="text-[11px] sm:text-xs text-white/80 hover:text-white border border-white/10 hover:border-white/20 rounded px-2 py-0.5 transition"
              //   title="Copy pair address"
              // >
              //   Copy
              // </button>
              <CopyReportButton address={dexData.pairAddress} />
            )}
          </div>
        </div>
      </div>

      {/* ---------- Order Flow ---------- */}
      {buyRatios.length > 0 && (
        <section>
          <h4 className="text-white/80 text-[12px] sm:text-sm mb-2 sm:mb-3">
            Order Flow (Buys vs Sells)
          </h4>
          <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
            {buyRatios.map(({ label, value }) => (
              <PercentBar key={label} label={label} value={value} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Price Change ---------- */}
      {priceChanges.length > 0 && (
        <section>
          <h4 className="text-white/80 text-[12px] sm:text-sm mb-2 sm:mb-3">
            Price Change
          </h4>
          <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
            {priceChanges.map(({ label, value }) => (
              <PercentBar key={label} label={label} value={value} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Volumes (scroll on mobile, grid on md+) ---------- */}
      {volumes.length > 0 && (
        <section>
          <h4 className="text-white/80 text-[12px] sm:text-sm mb-2 sm:mb-3">
            Volume
          </h4>

          {/* Mobile horizontal snap */}
          <div className="md:hidden -mx-2 px-2">
            <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-1">
              {volumes.map(({ label, value }) => (
                <div
                  key={label}
                  className="min-w-[150px] snap-start rounded-lg bg-black/30 border border-white/10 p-3"
                >
                  <div
                    className="text-[11px] text-white/60 truncate"
                    title={label}
                  >
                    {label}
                  </div>
                  <div className="text-base font-semibold text-white mt-1 tabular-nums">
                    {fmtMoneyCompact(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop grid */}
          <div className="hidden md:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {volumes.map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg bg-black/30 border border-white/10 p-3"
              >
                <div className="text-xs text-white/60 truncate" title={label}>
                  {label}
                </div>
                <div className="text-lg font-semibold text-white mt-1 tabular-nums">
                  {fmtMoneyCompact(value)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Market Stats ---------- */}
      {statTiles.length > 0 && (
        <section>
          <h4 className="text-white/80 text-[12px] sm:text-sm mb-2 sm:mb-3">
            Market Stats
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {statTiles.map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg bg-black/30 border border-white/10 p-2.5 sm:p-3"
              >
                <div
                  className="text-[11px] sm:text-xs text-white/60 truncate"
                  title={label}
                >
                  {label}
                </div>
                <div className="text-sm sm:text-base font-semibold text-white mt-1 tabular-nums">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

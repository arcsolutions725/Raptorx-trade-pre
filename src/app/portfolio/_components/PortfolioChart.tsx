"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PortfolioRange } from "@/lib/portfolio/types";
import { pnlUsd, tickLabel, usd, type SeriesPoint } from "./portfolioMath";

const PAD = { t: 16, r: 8, b: 26, l: 8 };

/** Value / PNL line with area fill, grid, zero line (PNL), hover crosshair + tooltip (design/js/portfolio.js drawChart). */
export function PortfolioChart({
  points,
  mode,
  range,
  loading,
}: {
  points: SeriesPoint[];
  mode: "value" | "pnl";
  range: PortfolioRange;
  loading?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 300 });
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 300 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = mode === "value" ? points.map((p) => p.v) : points.map((p) => p.v - (points[0]?.v ?? 0));
  const { w: W, h: H } = size;
  const n = data.length;
  const min = n ? Math.min(...data) : 0;
  const max = n ? Math.max(...data) : 1;
  const span = max - min || 1;
  const x = (i: number) => PAD.l + (n > 1 ? i / (n - 1) : 0) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const last = data[n - 1] ?? 0;
  const up = last >= (data[0] ?? 0);
  const col = mode === "pnl" ? (last >= 0 ? "#45E3A3" : "#FF7A7A") : "#FFC23D";
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d).toFixed(1)}`).join("");
  const ticks = n > 1 ? [0, Math.floor(n / 3), Math.floor((n * 2) / 3), n - 1] : [];
  const fmtV = (v: number) => (mode === "value" ? usd(v) : pnlUsd(v));
  const label = n
    ? `Portfolio ${mode === "value" ? "value" : "PNL"} over ${range === "ALL" ? "the last year" : range}, ${up ? "up" : "down"} from ${fmtV(data[0])} to ${fmtV(last)}`
    : "Portfolio chart";

  const onMove = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r || n < 2) return;
    const i = Math.round(((clientX - r.left - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={wrap} className="pf-chart" role="img" aria-label={label} aria-busy={loading || undefined}>
      {n > 1 ? (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
          onPointerMove={(e) => onMove(e.clientX)}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`pf${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={col} stopOpacity=".32" />
              <stop offset="1" stopColor={col} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => {
            const gy = PAD.t + f * (H - PAD.t - PAD.b);
            return <line key={f} x1="0" x2={W} y1={gy} y2={gy} className="pf-grid" />;
          })}
          {mode === "pnl" && min < 0 && max > 0 ? (
            <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="pf-zero" />
          ) : null}
          <path d={`${line}L${x(n - 1)},${H - PAD.b}L${x(0)},${H - PAD.b}Z`} fill={`url(#pf${gid})`} />
          <path d={line} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          {hover != null ? (
            <g>
              <line className="pf-cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />
              <circle r="5" cx={x(hover)} cy={y(data[hover])} fill={col} stroke="#0B0B0B" strokeWidth="2.5" />
            </g>
          ) : null}
          {ticks.map((i, k) => (
            <text
              key={k}
              x={x(i)}
              y={H - 6}
              textAnchor={k === 0 ? "start" : k === 3 ? "end" : "middle"}
              className="pf-tick"
            >
              {tickLabel(range, points[i].t)}
            </text>
          ))}
        </svg>
      ) : (
        <div className={`pf-chart__empty${loading ? " rx-skel" : ""}`} />
      )}
      {hover != null && n > 1 ? (
        <div
          className="pf-tip"
          style={{
            left: Math.min(W - 150, Math.max(0, x(hover) - 70)),
            top: Math.max(0, y(data[hover]) - 58),
          }}
        >
          <b className="rx-num">{fmtV(data[hover])}</b>
          <span>{tickLabel(range, points[hover].t)}</span>
        </div>
      ) : null}
    </div>
  );
}

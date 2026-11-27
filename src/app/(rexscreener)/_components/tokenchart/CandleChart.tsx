"use client";

/**
 * Candlestick chart for the token page (design/token.html "Chart by TradingView"): TradingView's
 * Lightweight Charts, styled like the design's chart (design/js/chart.js RXChart.candles): the
 * --rx-chart-* type and grid tokens, prices on the right, the last price as a dashed line with a
 * filled tag, no chrome. Drag / wheel / pinch scroll and zoom; an OHLC readout of the candle under the
 * pointer (else the latest) sits top left. Times are the viewer's local time.
 */

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/api/geckoterminal";
import { formatAxisPrice, formatPrice, priceDecimals } from "./priceFormat";

const UP = "#45E3A3"; // --rx-up
const DOWN = "#FF7A7A"; // --rx-down

/** Lightweight Charts draws times as UTC: shift them so the axis reads the viewer's local time. */
const toLocal = (t: number) =>
  (t - new Date(t * 1000).getTimezoneOffset() * 60) as UTCTimestamp;

type Bar = { o: number; h: number; l: number; c: number };

type Props = {
  candles: Candle[];
  /** screen-reader name, e.g. "WETH price, 15-minute candles" */
  label: string;
};

export default function CandleChart({ candles, label }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  /** time of the newest candle drawn: later data only updates from there (keeps the user's zoom) */
  const lastTimeRef = useRef<number | null>(null);
  const latestRef = useRef<Bar | null>(null);
  const [legend, setLegend] = useState<Bar | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const css = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: css("--rx-chart-ink", "#9E9D9C"),
        fontFamily: cs.fontFamily,
        fontSize: parseFloat(css("--rx-chart-fs", "12")) || 12,
        attributionLogo: false, // credited in the chart head ("Chart by TradingView")
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: css("--rx-chart-grid", "rgba(255,240,220,.07)") },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 9,
        minBarSpacing: 2,
        rightOffset: 3,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,240,220,.28)", style: LineStyle.Dashed, labelBackgroundColor: "#2A2826" },
        horzLine: { color: "rgba(255,240,220,.28)", style: LineStyle.Dashed, labelBackgroundColor: "#2A2826" },
      },
      // phones: a vertical swipe on the chart still scrolls the page
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
    });
    chart.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(series) as CandlestickData | undefined;
      setLegend(
        d && "open" in d ? { o: d.open, h: d.high, l: d.low, c: d.close } : latestRef.current,
      );
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lastTimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !candles.length) return;
    // Price format for this token: about four significant digits, zero runs as subscripts.
    const d = priceDecimals(candles[candles.length - 1].c);
    series.applyOptions({
      priceFormat: {
        type: "custom",
        minMove: Math.pow(10, -d),
        formatter: (v: number) => formatAxisPrice(v, d),
      },
    });
    const bars = candles.map((c) => ({
      time: toLocal(c.t),
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));
    const last = lastTimeRef.current;
    if (last == null) {
      series.setData(bars);
    } else {
      // refresh: redraw the newest candle and add the ones after it (the view stays where it is)
      for (const b of bars) if (b.time >= last) series.update(b);
    }
    lastTimeRef.current = bars[bars.length - 1].time;
    const lc = candles[candles.length - 1];
    latestRef.current = { o: lc.o, h: lc.h, l: lc.l, c: lc.c };
    setLegend((cur) => cur ?? latestRef.current);
  }, [candles]);

  const shown = legend;
  const tone = shown && shown.c >= shown.o ? UP : DOWN;
  const chg = shown && shown.o > 0 ? ((shown.c - shown.o) / shown.o) * 100 : null;
  const lastC = candles.length ? candles[candles.length - 1].c : null;

  return (
    <div
      ref={boxRef}
      className="rx-cc"
      role="img"
      aria-label={lastC != null ? `${label}. Last ${formatPrice(lastC)} US dollars.` : label}
    >
      {shown ? (
        <div className="rx-cc__legend" aria-hidden="true">
          <span>
            O <b style={{ color: tone }}>{formatPrice(shown.o)}</b>
          </span>
          <span>
            H <b style={{ color: tone }}>{formatPrice(shown.h)}</b>
          </span>
          <span>
            L <b style={{ color: tone }}>{formatPrice(shown.l)}</b>
          </span>
          <span>
            C <b style={{ color: tone }}>{formatPrice(shown.c)}</b>
          </span>
          {chg != null ? (
            <b style={{ color: chg >= 0 ? UP : DOWN }}>
              {chg >= 0 ? "+" : ""}
              {chg.toFixed(2)}%
            </b>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

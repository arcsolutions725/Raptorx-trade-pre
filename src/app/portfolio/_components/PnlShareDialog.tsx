"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Share, X } from "lucide-react";
import type { PortfolioRange } from "@/lib/portfolio/types";
import { animalAvatarSrc } from "@/components/ui/modal/accountUi";
import { paintTierBadge, tierOf } from "@/components/rewards/tiers";
import {
  amtFmt,
  historyPools,
  pct,
  pnlUsd,
  priceFmt,
  proxiedImage,
  usd,
  valueSeries,
  type HoldingRow,
  type Totals,
} from "./portfolioMath";
import { usePortfolioHistory, type PfUser } from "./usePortfolioData";

type Period = "24H" | "7D" | "30D" | "ALL";
const PERIODS: Period[] = ["24H", "7D", "30D", "ALL"];
type Theme = "gold" | "claw" | "night";

const THEMES: Record<Theme, { bg: [string, string, string]; glow: string; accent: string; line: string; label: string }> = {
  gold: { bg: ["#1C1408", "#0B0907", "#050505"], glow: "rgba(255,184,0,.30)", accent: "#FFC23D", line: "rgba(255,209,92,.22)", label: "Gold" },
  claw: { bg: ["#2A0A0C", "#120707", "#050505"], glow: "rgba(227,49,31,.38)", accent: "#FF5A3C", line: "rgba(255,106,19,.25)", label: "Ember" },
  night: { bg: ["#0B1222", "#070A12", "#040507"], glow: "rgba(91,140,255,.28)", accent: "#8FB0FF", line: "rgba(143,176,255,.22)", label: "Midnight" },
};

const W = 1200;
const H = 675;

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImg(src: string) {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((res) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

type Card = {
  title: string;
  sub: string;
  pnl: number;
  pc: number | null;
  a: [string, string];
  b: [string, string];
  logo: string | null;
  spark: number[];
};

/** "Share your PNL" (design/portfolio.html #pfShare): a canvas card that downloads as a real image. */
export function PnlShareDialog({
  open,
  initialScope,
  onClose,
  rows,
  totals,
  scopeLabel,
  user,
}: {
  open: boolean;
  /** "ALL" or a token key */
  initialScope: string;
  onClose: () => void;
  rows: HoldingRow[];
  totals: Totals;
  scopeLabel: string;
  user: PfUser | null;
}) {
  const [scope, setScope] = useState(initialScope);
  const [period, setPeriod] = useState<Period>("30D");
  const [theme, setTheme] = useState<Theme>("gold");
  const [showAmt, setShowAmt] = useState(true);
  const [showRef, setShowRef] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) setScope(initialScope);
  }, [open, initialScope]);

  // focus, Esc, scroll lock, focus restore
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);

  const pools = useMemo(() => historyPools(rows.map((r) => r.token)), [rows]);
  const histRange: PortfolioRange = period;
  const hist = usePortfolioHistory(pools, histRange, open && period !== "24H");
  const hist24 = usePortfolioHistory(pools, "24H", open && period === "24H");
  const series = (period === "24H" ? hist24.data : hist.data)?.series;

  const card = useMemo((): Card | null => {
    const now = Math.floor(Date.now() / 1000);
    const spark = (rs: HoldingRow[]) => valueSeries(rs, series, period, now).map((p) => p.v);
    const change = (s: number[]) => {
      const first = s[0] ?? 0;
      const last = s[s.length - 1] ?? 0;
      return { pnl: last - first, pc: first > 0 ? ((last - first) / first) * 100 : null };
    };
    if (scope === "ALL") {
      const s = spark(rows);
      let { pnl, pc } = change(s);
      if (period === "24H") {
        pnl = totals.day;
        pc = totals.dayPct;
      } else if (period === "ALL" && totals.total != null && totals.costKnown > 0) {
        pnl = totals.total;
        pc = totals.totalPct;
      }
      return {
        title: "Total portfolio",
        sub: scopeLabel,
        pnl,
        pc,
        a: ["Value", usd(totals.value)],
        b: ["Tokens", String(rows.length)],
        logo: null,
        spark: s,
      };
    }
    const r = rows.find((x) => x.token.key === scope);
    if (!r) return null;
    const s = spark([r]);
    let { pnl, pc } = change(s);
    const c = r.token.change24h;
    if (period === "24H" && c != null && r.value != null) {
      pnl = r.value - r.value / (1 + c / 100);
      pc = c;
    } else if (period === "ALL" && r.pnl != null) {
      pnl = r.pnl;
      pc = r.pnlPct;
    }
    return {
      title: "$" + r.token.symbol,
      sub: r.token.name,
      pnl,
      pc,
      a: r.avgCost != null ? ["Entry", priceFmt(r.avgCost)] : ["Balance", amtFmt(r.amount)],
      b: ["Now", r.token.priceUsd != null ? priceFmt(r.token.priceUsd) : "—"],
      logo: r.token.logo,
      spark: s,
    };
  }, [scope, period, rows, totals, series, scopeLabel]);

  const refLink = user?.referralCode ? `raptorx.trade?referralcode=${user.referralCode}` : null;
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const draw = useCallback(async () => {
    const cv = canvasRef.current;
    const c = cv?.getContext("2d");
    if (!cv || !c || !card) return;
    const th = THEMES[theme];
    const up = card.pnl >= 0;
    try {
      await Promise.all(
        ['800 120px Archivo', '600 30px "Instrument Sans"', '500 22px "JetBrains Mono"'].map((f) => document.fonts.load(f)),
      );
    } catch {
      /* system fonts */
    }
    const [logoImg, avImg, tok] = await Promise.all([
      loadImg("/images/raptorx-logo.svg"),
      user ? loadImg(animalAvatarSrc(user.username)) : Promise.resolve(null),
      card.logo ? loadImg(proxiedImage(card.logo)) : Promise.resolve(null),
    ]);
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, th.bg[0]);
    g.addColorStop(0.55, th.bg[1]);
    g.addColorStop(1, th.bg[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const rg = c.createRadialGradient(980, 120, 10, 980, 120, 560);
    rg.addColorStop(0, th.glow);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = rg;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = th.line;
    c.globalAlpha = 0.45;
    c.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      c.beginPath();
      c.moveTo(0, i * 112);
      c.lineTo(W, i * 112);
      c.stroke();
    }
    c.globalAlpha = 1;

    // the sharer's avatar with their tier ring and badge: the card is about the person
    if (user) {
      const tier = tierOf(user.points);
      const ax = 990;
      const ay = 168;
      const ar = 104;
      const ring = c.createLinearGradient(ax, ay - ar, ax, ay + ar);
      ring.addColorStop(0, tier.a);
      ring.addColorStop(1, tier.b);
      c.beginPath();
      c.arc(ax, ay, ar + 7, 0, Math.PI * 2);
      c.fillStyle = ring;
      c.fill();
      c.beginPath();
      c.arc(ax, ay, ar, 0, Math.PI * 2);
      c.fillStyle = "#120C08";
      c.fill();
      if (avImg) {
        c.save();
        c.beginPath();
        c.arc(ax, ay, ar - 3, 0, Math.PI * 2);
        c.clip();
        c.drawImage(avImg, ax - ar, ay - ar, ar * 2, ar * 2);
        c.restore();
      }
      paintTierBadge(c, tier, ax + ar * 0.48, ay + ar * 0.42, 60);
      c.textAlign = "center";
      c.fillStyle = "#F5F3F0";
      c.font = '700 30px "Instrument Sans", system-ui';
      c.fillText(user.username, ax, ay + ar + 52);
      c.fillStyle = th.accent;
      c.font = '500 18px "JetBrains Mono", monospace';
      c.fillText(`${tier.name} tier`.toUpperCase(), ax, ay + ar + 80);
      c.textAlign = "left";
    }

    // sparkline along the bottom
    const sp = card.spark;
    if (sp.length > 1) {
      const mn = Math.min(...sp);
      const mx = Math.max(...sp);
      const sx = (i: number) => 60 + (i / (sp.length - 1)) * (W - 120);
      const sy = (v: number) => 600 - ((v - mn) / (mx - mn || 1)) * 110;
      const col = up ? "#45E3A3" : "#FF7A7A";
      const fg = c.createLinearGradient(0, 490, 0, 610);
      fg.addColorStop(0, up ? "rgba(69,227,163,.28)" : "rgba(255,122,122,.28)");
      fg.addColorStop(1, "rgba(0,0,0,0)");
      c.beginPath();
      sp.forEach((v, i) => (i ? c.lineTo(sx(i), sy(v)) : c.moveTo(sx(i), sy(v))));
      c.lineTo(sx(sp.length - 1), 610);
      c.lineTo(60, 610);
      c.closePath();
      c.fillStyle = fg;
      c.fill();
      c.beginPath();
      sp.forEach((v, i) => (i ? c.lineTo(sx(i), sy(v)) : c.moveTo(sx(i), sy(v))));
      c.strokeStyle = col;
      c.lineWidth = 4;
      c.lineJoin = "round";
      c.stroke();
    }

    // header: logo + period
    if (logoImg) c.drawImage(logoImg, 60, 46, 92, 72);
    c.fillStyle = th.accent;
    c.font = '500 20px "JetBrains Mono", monospace';
    c.fillText((period === "ALL" ? "All-time PNL" : `${period} PNL`).toUpperCase(), 172, 92);

    // subject
    let tx = 60;
    const ty = 196;
    if (tok) {
      c.save();
      c.beginPath();
      c.arc(90, ty - 10, 30, 0, Math.PI * 2);
      c.closePath();
      c.fillStyle = "#fff";
      c.fill();
      c.clip();
      c.drawImage(tok, 60, ty - 40, 60, 60);
      c.restore();
      tx = 136;
    }
    c.fillStyle = "#F5F3F0";
    c.font = "800 44px Archivo, system-ui";
    c.fillText(card.title, tx, ty + 4);
    c.fillStyle = "#B3B2B1";
    c.font = '500 24px "Instrument Sans", system-ui';
    c.fillText(card.sub, tx, ty + 40);

    // the big number
    const col = up ? "#45E3A3" : "#FF7A7A";
    c.fillStyle = col;
    c.font = "800 148px Archivo, system-ui";
    c.fillText(card.pc != null ? pct(card.pc) : pnlUsd(card.pnl), 52, 392);
    if (showAmt && card.pc != null) {
      c.font = '700 40px "Instrument Sans", system-ui';
      c.fillText(pnlUsd(card.pnl), 60, 448);
    }

    // two facts
    const fx = 800;
    const fy = 418;
    (
      [
        [card.a, 0],
        [card.b, 190],
      ] as [[string, string], number][]
    ).forEach(([[k, v], off]) => {
      c.fillStyle = "#8A8988";
      c.font = '500 18px "JetBrains Mono", monospace';
      c.fillText(k.toUpperCase(), fx + off, fy);
      c.fillStyle = "#F5F3F0";
      c.font = '600 28px "Instrument Sans", system-ui';
      c.fillText(k === "Value" && !showAmt ? "—" : v, fx + off, fy + 34);
    });

    // footer
    c.fillStyle = "rgba(0,0,0,.45)";
    c.fillRect(0, 627, W, 48);
    c.fillStyle = "#B3B2B1";
    c.font = '500 18px "JetBrains Mono", monospace';
    c.fillText(showRef && refLink ? `Trade with me on RaptorX · ${refLink}` : "raptorx.trade", 60, 658);
    c.textAlign = "right";
    c.fillText(today, W - 60, 658);
    c.textAlign = "left";
  }, [card, theme, period, showAmt, showRef, refLink, today, user]);

  useEffect(() => {
    if (open) void draw();
  }, [open, draw]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  if (!open || typeof document === "undefined") return null;

  const up = (card?.pnl ?? 0) >= 0;
  const xText = card
    ? `${up ? "Up" : "Down"} ${card.pc != null ? pct(card.pc) : pnlUsd(card.pnl)} on ${
        scope === "ALL" ? "my portfolio" : card.title
      } (${period === "ALL" ? "all time" : period}) with RaptorX${showRef && refLink ? `\nhttps://${refLink}` : ""}`
    : "";
  const ariaCard = card
    ? `PNL card: ${card.title}, ${card.pc != null ? pct(card.pc) : ""}${showAmt ? `, ${pnlUsd(card.pnl)}` : ""}, ${period}`
    : "PNL card";

  const download = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    try {
      const a = document.createElement("a");
      a.download = `raptorx-pnl-${(scope === "ALL" ? "portfolio" : card?.title.slice(1) ?? "token").toLowerCase()}-${period.toLowerCase()}.png`;
      a.href = cv.toDataURL("image/png");
      a.click();
      setToast("Image downloaded");
    } catch {
      setToast("Couldn't create the image");
    }
  };
  const copyImage = () => {
    canvasRef.current?.toBlob(async (blob) => {
      try {
        if (!blob) throw new Error("no image");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setToast("Image copied");
      } catch {
        setToast("Copy not supported here, use Download");
      }
    });
  };

  return createPortal(
    <div className="rx-pf pf-share">
      <div className="pf-share__scrim" onClick={onClose} aria-hidden="true" />
      <div className="pf-share__dlg rx-raised" role="dialog" aria-modal="true" aria-labelledby="pfShareTitle">
        <div className="pf-share__head">
          <h2 className="pf-h2" id="pfShareTitle">
            Share your PNL
          </h2>
          <button ref={closeRef} className="rx-icon-btn" type="button" aria-label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="pf-share__body">
          <div className="pf-share__preview">
            <canvas ref={canvasRef} width={W} height={H} role="img" aria-label={ariaCard} />
          </div>
          <div className="pf-share__opts">
            <label className="pf-field">
              <span className="pf-k">Show</span>
              <select className="pf-select" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="ALL">Total portfolio</option>
                {rows.map((r) => (
                  <option key={r.token.key} value={r.token.key}>
                    ${r.token.symbol} · {r.token.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="pf-field">
              <span className="pf-k">Period</span>
              <div className="rx-seg" role="group" aria-label="Period">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`rx-seg__item${period === p ? " is-active" : ""}`}
                    aria-pressed={period === p}
                    onClick={() => setPeriod(p)}
                  >
                    {p === "ALL" ? "All" : p}
                  </button>
                ))}
              </div>
            </div>
            <div className="pf-field">
              <span className="pf-k">Style</span>
              <div className="pf-themes" role="radiogroup" aria-label="Card style">
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={theme === t}
                    className={`pf-theme pf-theme--${t}`}
                    onClick={() => setTheme(t)}
                  >
                    <i />
                    {THEMES[t].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="pf-toggle">
              <input type="checkbox" checked={showAmt} onChange={(e) => setShowAmt(e.target.checked)} />
              <span>Show dollar amounts</span>
            </label>
            {refLink ? (
              <label className="pf-toggle">
                <input type="checkbox" checked={showRef} onChange={(e) => setShowRef(e.target.checked)} />
                <span>Add my referral link</span>
              </label>
            ) : null}
            <div className="pf-share__acts">
              <button className="rx-btn rx-btn--primary rx-btn--block" type="button" onClick={download}>
                <Share className="size-3.5" aria-hidden="true" />
                Download image
              </button>
              <div className="pf-share__row">
                <button className="rx-btn rx-btn--secondary" type="button" onClick={copyImage}>
                  <Copy className="size-3.5" aria-hidden="true" />
                  Copy image
                </button>
                <a
                  className="rx-btn rx-btn--secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://x.com/intent/post?text=${encodeURIComponent(xText)}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"
                      fill="currentColor"
                    />
                  </svg>
                  Post on X
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pf-toast-host" aria-live="polite">
        {toast ? (
          <span className="rx-toast">
            <Check className="size-4 text-rx-up" aria-hidden="true" />
            {toast}
          </span>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

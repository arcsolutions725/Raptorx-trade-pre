"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

// HERO v3: raptor's-eye radar. A sweep circles the eye over a field of tokens; three targets get
// locked and their cards appear. Ported from design/js/landing.js.
const TAU = Math.PI * 2;
const PERIOD = 6200; // one sweep every 6.2s
const TICKERS = ["PEPE", "WIF", "BONK", "POPCAT", "TOSHI", "MOG", "DEGEN", "GOAT", "SPX", "FARTCOIN", "AI16Z", "ZEREBRO", "MEW", "PNUT", "NEIRO", "TURBO", "KEYCAT", "SKI", "HIGHER", "BALD", "Fed cut?", "BTC $120K?", "ETH ETF flows", "Senate odds", "CPI < 2.5%?", "Super Bowl"];

type Dot = { x: number; y: number; a: number; r: number; s: number; col: string; label: string | null; chg: string };
type Target = { el: HTMLElement; x: number; y: number; a: number; lockT: number; locked: boolean } | null;

export default function HeroRadar() {
  const rdRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const eyeRef = useRef<HTMLDivElement>(null);
  const pingRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const hx = rdRef.current;
    const cv = cvRef.current;
    const eye = eyeRef.current;
    const ping = pingRef.current;
    if (!hx || !cv || !eye || !ping) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const still = prefersReducedMotion();
    const cards = Array.from(hx.querySelectorAll<HTMLElement>(".gc[data-target]"));
    let W = 0, H = 0, cx = 0, cy = 0, raf = 0, on = true, t0 = 0, lastA = 0;
    let dots: Dot[] = [];
    let targets: Target[] = [];
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const centre = () => {
      const r = eye.getBoundingClientRect(), h = hx.getBoundingClientRect();
      cx = r.left - h.left + r.width / 2;
      cy = r.top - h.top + r.height / 2;
    };
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      centre();
      const R = Math.min(W, H) / 2, n = Math.round((R * R * 3.14) / 900);
      let k = 0;
      dots = Array.from({ length: n }, () => {
        const r = R * 0.2 + Math.sqrt(Math.random()) * R * 0.8, a = Math.random() * TAU, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        const c = Math.random(), label = Math.random() < 0.06 && W > 300 ? TICKERS[k++ % TICKERS.length] : null;
        return { x, y, a, r, s: 0.6 + Math.random() * 1.5, col: c < 0.14 ? "69,227,163" : c < 0.24 ? "255,122,122" : c < 0.3 ? "255,209,92" : "235,228,218", label, chg: (Math.random() * 30 - 8).toFixed(1) };
      }).filter((d) => d.x > -4 && d.x < W + 4 && d.y > -4 && d.y < H + 4);
      // each card's target sits on the card's edge that faces the eye
      const hr = hx.getBoundingClientRect();
      targets = cards.map((el, i) => {
        if (getComputedStyle(el).display === "none") return null;
        const r = el.getBoundingClientRect(), x0 = r.left - hr.left, y0 = r.top - hr.top;
        const x = Math.max(x0, Math.min(cx, x0 + r.width)), y = Math.max(y0, Math.min(cy, y0 + r.height));
        const tx = x + (x === x0 ? -28 : x === x0 + r.width ? 28 : 0), ty = y + (y === y0 ? -24 : y === y0 + r.height ? 24 : 0);
        const old = targets[i];
        return { el, x: tx, y: ty, a: (Math.atan2(ty - cy, tx - cx) + TAU) % TAU, lockT: old?.lockT || 0, locked: old?.locked || false };
      });
    };

    const draw = (now: number) => {
      const t = now - t0, a = still ? 5.2 : ((t / PERIOD) * TAU - Math.PI / 2 + TAU) % TAU;
      ctx.clearRect(0, 0, W, H);
      const R = Math.min(W, H) / 2;

      // range rings, ticks and crosshair
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        const r = R * (0.25 + i * 0.1875);
        ctx.strokeStyle = `rgba(255,190,90,${0.16 - i * 0.022})`;
        ctx.setLineDash(i % 2 ? [2, 6] : []);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,190,90,.05)";
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      for (let i = 0; i < 72; i++) {
        const ang = (i / 72) * TAU, r1 = R * 0.96, r2 = r1 - (i % 6 ? 5 : 11);
        ctx.strokeStyle = "rgba(255,190,90,.22)";
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2); ctx.stroke();
      }

      // the sweep: a fading wedge behind a bright leading edge
      if (typeof ctx.createConicGradient === "function") {
        const g = ctx.createConicGradient(a - 1.05, cx, cy);
        g.addColorStop(0, "rgba(255,170,40,0)"); g.addColorStop(0.135, "rgba(255,170,40,.10)"); g.addColorStop(0.1665, "rgba(255,200,90,.26)"); g.addColorStop(0.1675, "rgba(255,170,40,0)"); g.addColorStop(1, "rgba(255,170,40,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a - 1.05, a + 0.01); ctx.closePath(); ctx.fill();
      }
      const lg = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      lg.addColorStop(0, "rgba(255,226,154,.9)"); lg.addColorStop(1, "rgba(255,170,40,0)");
      ctx.strokeStyle = lg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();

      // token field: each dot flares as the sweep passes, then fades
      ctx.font = '600 10.5px "JetBrains Mono", monospace';
      for (const d of dots) {
        const since = still ? 1.2 + ((d.a * 7) % 3) : (a - d.a + TAU) % TAU, glow = Math.exp(-since * 1.6);
        const al = 0.16 + glow * 0.84;
        ctx.fillStyle = `rgba(${d.col},${al})`;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.s + glow * 1.4, 0, TAU); ctx.fill();
        if (d.label && glow > 0.18) {
          ctx.fillStyle = `rgba(235,228,218,${glow * 0.8})`; ctx.fillText(d.label, d.x + 7, d.y - 5);
          ctx.fillStyle = `rgba(${+d.chg >= 0 ? "69,227,163" : "255,122,122"},${glow * 0.8})`; ctx.fillText((+d.chg >= 0 ? "+" : "") + d.chg + "%", d.x + 7, d.y + 7);
        }
      }

      // targets: lock when the sweep crosses them, draw closing reticle and a tether to the card
      for (const tg of targets) {
        if (!tg) continue;
        const crossed = still || (lastA <= tg.a && a >= tg.a) || (lastA > a && (tg.a >= lastA || tg.a <= a));
        if (crossed && (still || t > 900)) {
          if (!tg.locked) { tg.locked = true; tg.el.classList.add("is-locked"); }
          tg.lockT = now;
          if (!still) { tg.el.classList.add("is-flash"); later(() => tg.el.classList.remove("is-flash"), 650); }
          if (!still) { ping.classList.remove("is-on"); void ping.offsetWidth; ping.classList.add("is-on"); }
        }
        if (!tg.locked) { ctx.fillStyle = "rgba(255,209,92,.55)"; ctx.beginPath(); ctx.arc(tg.x, tg.y, 2.4, 0, TAU); ctx.fill(); continue; }
        const k = still ? 1 : Math.min(1, (now - tg.lockT) / 520), e = 1 - Math.pow(1 - k, 3), pulse = still ? 0 : Math.exp(-(now - tg.lockT) / 700);
        const sz = 34 - e * 20, br = 7;
        ctx.strokeStyle = `rgba(255,209,92,${0.65 + pulse * 0.35})`; ctx.lineWidth = 1.6;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = tg.x + sx * sz, y = tg.y + sy * sz;
          ctx.beginPath(); ctx.moveTo(x, y - sy * br); ctx.lineTo(x, y); ctx.lineTo(x - sx * br, y); ctx.stroke();
        }
        ctx.fillStyle = "#FFD15C"; ctx.shadowColor = "rgba(255,190,60,.9)"; ctx.shadowBlur = 12 + pulse * 18;
        ctx.beginPath(); ctx.arc(tg.x, tg.y, 3.4 + pulse * 2, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
        if (pulse > 0.02) { ctx.strokeStyle = `rgba(255,209,92,${pulse * 0.7})`; ctx.beginPath(); ctx.arc(tg.x, tg.y, 10 + (1 - pulse) * 30, 0, TAU); ctx.stroke(); }
      }
      lastA = a;
      if (on && !still) raf = requestAnimationFrame(draw);
    };

    const resize = () => {
      size();
      if (still) draw(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(hx);
    window.addEventListener("load", resize);

    // start the sweep only after the page has loaded, so the headline paints first
    let io: IntersectionObserver | null = null;
    const start = () => {
      io = new IntersectionObserver(([e]) => {
        on = e.isIntersecting;
        cancelAnimationFrame(raf);
        if (on && !still) {
          t0 = t0 || performance.now();
          raf = requestAnimationFrame(draw);
        }
      });
      io.observe(hx);
    };
    const startSoon = () => later(start, 200);
    resize();
    if (document.readyState === "complete") startSoon();
    else window.addEventListener("load", startSoon);

    return () => {
      on = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      window.removeEventListener("load", resize);
      window.removeEventListener("load", startSoon);
      cards.forEach((el) => el.classList.remove("is-locked", "is-flash"));
      ping.classList.remove("is-on");
    };
  }, []);

  return (
    // the raptor's eye radar lives in its own circle, never behind the text
    <div className="rd" aria-hidden="true" ref={rdRef}>
      <canvas className="rd__cv" ref={cvRef} />
      <div className="rd__eye" ref={eyeRef}>
        <img
          src="/landing/eye.webp"
          srcSet="/landing/eye-sm.webp 360w, /landing/eye.webp 640w"
          sizes="260px"
          alt=""
          width={640}
          height={640}
          fetchPriority="high"
        />
        <i className="rd__ping" ref={pingRef} />
      </div>
      <div className="gc gc--report" data-target="0">
        <img className="gc__tok" src="/landing/tokens/vvv.webp" alt="" width={44} height={44} />
        <div>
          <span className="gc__label">Golden Report · VVV</span>
          <b className="rx-num">$475.53M</b>
          <span className="gc__up rx-num">▲ 4.18% · 24h</span>
        </div>
      </div>
      <div className="gc gc--pump" data-target="1">
        <img className="gc__tok" src="/landing/tokens/morpho.webp" alt="" width={40} height={40} />
        <div>
          <span className="gc__label">Pump Report · MORPHO</span>
          <b className="rx-num">▲ 182%</b>
          <span className="gc__dim">1h · volume 6.4×</span>
        </div>
      </div>
      <div className="gc gc--odds" data-target="2">
        <div className="gc__row">
          <span className="gc__label">Fed holds rates · Dec</span>
          <span className="gc__chg rx-num">▲ 6.2</span>
        </div>
        <b className="gc__big rx-num">64%</b>
        <svg className="gc__spark" viewBox="0 0 160 36" preserveAspectRatio="none">
          <path
            d="M0 28 L14 26 L28 27 L42 22 L56 24 L70 18 L84 19 L98 14 L112 15 L126 10 L140 11 L160 6"
            fill="none"
            stroke="#45E3A3"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="gc__btns">
          <span className="rx-yes">Yes 64¢</span>
          <span className="rx-no">No 36¢</span>
        </div>
      </div>
    </div>
  );
}

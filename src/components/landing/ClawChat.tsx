"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { REX_SCREENER_EXCHANGE_HREF } from "@/components/ui/layout/shellActions";
import { ArrowIcon } from "./icons";
import { prefersReducedMotion } from "./motion";

/** The big Claw window: once it's on screen the checklist runs, then the answer appears. */
export default function ClawChat() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const still = prefersReducedMotion();
    const timers: number[] = [];
    let raf = 0;

    const think = () => {
      const lis = Array.from(root.querySelectorAll<HTMLElement>(".mk-think li"));
      const ans = root.querySelector<HTMLElement>(".mk-ans");
      const secs = root.querySelector<HTMLElement>('[data-mk="secs"]');
      lis.forEach((l) => (l.className = ""));
      ans?.classList.remove("is-on");
      if (still) {
        lis.forEach((l) => l.classList.add("is-ok"));
        ans?.classList.add("is-on");
        if (secs) secs.textContent = "3.8s";
        return;
      }
      const gap = 750;
      const t0 = performance.now();
      lis.forEach((l, i) => {
        timers.push(window.setTimeout(() => l.classList.add("is-run"), 200 + i * gap));
        timers.push(
          window.setTimeout(() => {
            l.classList.remove("is-run");
            l.classList.add("is-ok");
          }, 200 + (i + 1) * gap),
        );
      });
      if (secs) {
        const tick = () => {
          const s = (performance.now() - t0) / 1000;
          secs.textContent = s.toFixed(1) + "s";
          if (s < (lis.length * gap) / 1000) raf = requestAnimationFrame(tick);
        };
        tick();
      }
      timers.push(window.setTimeout(() => ans?.classList.add("is-on"), 300 + lis.length * gap));
    };

    const io = new IntersectionObserver(
      (es, o) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            think();
            o.disconnect();
          }
        }),
      { threshold: 0.4 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className="mk-claw"
      data-mk="claw"
      role="group"
      aria-label="Claw AI 5.0 thinking through a question about VVV on Base, then answering with levels and a trade button"
      ref={ref}
    >
      <aside className="mk-claw__side" aria-hidden="true">
        <span className="mk-new-chat">+ New chat</span>
        <span className="mk-label">Today</span>
        <i className="is-on">VVV on the 15m</i>
        <i>Fed cut odds, Dec</i>
        <i>Hottest AI markets</i>
        <span className="mk-label">Yesterday</span>
        <i>AERO deep dive</i>
        <i>Arb: Kalshi vs Polymarket</i>
      </aside>
      <div className="mk-claw__main" aria-hidden="true">
        <div className="mk-msg mk-msg--me">Is $VVV leaning bullish on the 15m?</div>
        <div className="mk-think mk-think--steps">
          <div className="mk-think__h">
            <img src="/landing/claw-logo-96.webp" alt="" width={16} height={16} loading="lazy" decoding="async" />
            <span>Thinking</span>
            <em className="rx-num" data-mk="secs">
              0.0s
            </em>
          </div>
          <ul>
            <li>Pulling 15m candles from 4 venues</li>
            <li>Reading funding and open interest</li>
            <li>Scanning 214 news sources</li>
            <li>Checking whale wallets on Base</li>
          </ul>
        </div>
        <div className="mk-ans mk-ans--wide">
          <div className="mk-tok-row">
            <img className="tk-logo" src="/landing/tokens/vvv.webp" alt="" width={24} height={24} loading="lazy" decoding="async" />
            <b>Venice Token</b>
            <em>VVV · Base</em>
            <b className="rx-num">$19.78</b>
            <span className="mk-up">▲ 2.6%</span>
            <svg viewBox="0 0 120 30" className="mk-spark">
              <path
                className="mk-draw"
                pathLength={1}
                d="M0 24 L10 22 L20 25 L30 18 L40 20 L50 14 L60 16 L70 10 L80 12 L90 7 L100 9 L110 4 L120 5"
                fill="none"
                stroke="#45E3A3"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <p>
            <b>Yes, leaning bullish.</b> Price reclaimed the 15m VWAP and funding stays neutral, so the move
            isn&apos;t crowded. Two large Base wallets added 41K VVV in the last hour.
          </p>
          <div className="mk-levels">
            <span>
              Support <b className="rx-num">$19.12</b>
            </span>
            <span>
              Target <b className="rx-num">$21.40</b>
            </span>
            <span>
              Confidence <b>64%</b>
            </span>
          </div>
          <div className="mk-ans__foot">
            <span className="mk-ghost">Deep analysis</span>
            {/* the prototype opens its Exchange page with VVV preselected (exchange.html?to=VVV); the app's
                exchange is a panel inside RexScreener, opened by `?exchange=1` (no token preselect) */}
            <Link className="mk-cta" href={REX_SCREENER_EXCHANGE_HREF}>
              Trade on RaptorX
              <ArrowIcon size={14} strokeWidth={2.4} ariaHidden={false} />
            </Link>
          </div>
        </div>
        <div className="mk-composer">
          <span>Ask Claw anything…</span>
          <i>
            <img className="claw-logo" src="/landing/claw-logo-96.webp" alt="" width={20} height={20} loading="lazy" decoding="async" />
          </i>
        </div>
      </div>
    </div>
  );
}

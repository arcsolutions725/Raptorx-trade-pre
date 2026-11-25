import Link from "next/link";
import HeroRadar from "./HeroRadar";
import { ArrowIcon } from "./icons";
import { cssVars } from "./motion";

/** HERO: the raptor eye radar. A sweep passes over a field of tokens and markets and locks onto three worth a look. */
export default function Hero() {
  return (
    <section className="hx" aria-labelledby="hero-title">
      <div className="hx__scene" aria-hidden="true">
        <div className="hx__vignette" />
      </div>
      <div className="hx__in">
        <div className="hx__copy">
          <p className="hx__pill reveal">
            <span className="hx__live" />
            <span>AI screener for memecoins &amp; prediction markets</span>
          </p>
          <h1 id="hero-title" className="hx__title">
            See every move.<span>Trade the right one.</span>
          </h1>
          <p className="hx__sub reveal" style={cssVars({ "--d": ".2s" })}>
            RaptorX scans tokens and prediction markets around the clock. Claw AI flags what&apos;s worth your
            attention, tells you why, and you trade it in the same window.
          </p>
          <div className="hx__cta reveal" style={cssVars({ "--d": ".3s" })}>
            <Link className="rx-btn rx-btn--primary js-ring rx-btn--l hx__enter" href="/base">
              Enter RaptorX
              <ArrowIcon size={18} />
            </Link>
            <a className="rx-btn rx-btn--secondary rx-btn--l hx__ghost" href="#flow">
              See how it works
            </a>
          </div>
          <ul className="hx__facts" aria-label="At a glance">
            <li>
              <b className="rx-num">6</b>chains on RexScreener
            </li>
            <li>
              <b className="rx-num">5</b>prediction venues, one screen
            </li>
            <li>
              <b className="rx-num">1</b>terminal, research to trade
            </li>
          </ul>
        </div>
        <HeroRadar />
      </div>
    </section>
  );
}

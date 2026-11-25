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
          <h1 id="hero-title" className="hx__title">
            RaptorX is the AI<span>for Internet Markets.</span>
          </h1>
          <p className="hx__sub reveal" style={cssVars({ "--d": ".2s" })}>
            From millions of cryptocurrencies to hundreds of thousands of prediction markets, RaptorX’s proprietary
            engine Claw AI 5.0 brings you real-time research reports and market context so you can deploy capital
            intelligently within 1 research-to-trade workflow.
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
              <b className="rx-num">20M+</b>Cryptocurrencies
            </li>
            <li>
              <b className="rx-num">100K+</b>Prediction Markets
            </li>
            <li>
              <b className="rx-num">1</b>AI Engine for Research-To-Trade
            </li>
          </ul>
        </div>
        <HeroRadar />
      </div>
    </section>
  );
}

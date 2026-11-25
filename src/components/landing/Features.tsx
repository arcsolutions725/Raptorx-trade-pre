import Bento from "./Bento";
import SearchTyping from "./SearchTyping";
import { BoltIcon } from "./icons";
import { cssVars } from "./motion";

// pump bars: heights from the prototype; --n (the cascade index landing.js set at runtime) is static here
const PUMP_BARS = ["18%", "22%", "16%", "26%", "20%", "30%", "24%", "92%", "78%"];
const PUMP_SPIKES = 2;

/** FEATURES: the bento of everything a trader opens ten tabs for. */
export default function Features() {
  return (
    <section className="feats" aria-labelledby="feats-title">
      <div className="sec-head reveal">
        <p className="eyebrow">Built for the hunt</p>
        <h2 id="feats-title">Everything a trader opens ten tabs for.</h2>
      </div>
      <Bento>
        <li className="bx bx--golden reveal">
          <div className="bx__t">
            <img src="/landing/ic-golden.webp" alt="" width={52} height={52} loading="lazy" decoding="async" />
            <b>Golden Reports</b>
            <span>
              Hand-picked projects with working teams, real culture and relevance. Market cap and volume up front, team
              updates inside.
            </span>
          </div>
          <div className="bx__viz viz-fan" aria-hidden="true">
            <div className="fan-card" style={cssVars({ "--r": "-9deg", "--x": "-58%" })}>
              <b>
                Virtuals <em>VIRTUAL</em>
              </b>
              <span className="mk-label">Market cap</span>
              <b className="rx-num">$1.31B</b>
              <span className="mk-up">▲ 6.4%</span>
            </div>
            <div className="fan-card fan-card--r" style={cssVars({ "--r": "9deg", "--x": "58%" })}>
              <b>
                Brett <em>BRETT</em>
              </b>
              <span className="mk-label">Market cap</span>
              <b className="rx-num">$842M</b>
              <span className="mk-up">▲ 2.1%</span>
            </div>
            <div className="fan-card fan-card--top">
              <div className="fan-card__h">
                <img src="/landing/ic-golden.webp" alt="" width={26} height={26} loading="lazy" decoding="async" />
                <b>
                  Aerodrome <em>AERO</em>
                </b>
              </div>
              <div className="mk-big mk-big--sm">
                <div>
                  <span className="mk-label">Market cap</span>
                  <b className="rx-num">$475.5M</b>
                </div>
                <div>
                  <span className="mk-label">Volume 24h</span>
                  <b className="rx-num">$38.2M</b>
                </div>
              </div>
              <svg viewBox="0 0 200 50" preserveAspectRatio="none">
                <path
                  className="mk-draw"
                  pathLength={1}
                  d="M0 40 L20 36 L40 38 L60 30 L80 32 L100 24 L120 27 L140 19 L160 21 L180 12 L200 8"
                  fill="none"
                  stroke="#45E3A3"
                  strokeWidth="2.2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span className="fan-card__foot">💬 3 team updates</span>
            </div>
          </div>
        </li>
        <li className="bx bx--pump reveal" style={cssVars({ "--d": ".06s" })}>
          <div className="bx__t bx__t--row">
            <img src="/landing/ic-pump.webp" alt="" width={44} height={44} loading="lazy" decoding="async" />
            <div>
              <b>Pump Reports</b>
              <span>Momentum alerts when volume spikes, with the move, the window and a one-click trade.</span>
            </div>
          </div>
          <div className="bx__viz viz-pump" aria-hidden="true">
            <div className="pump-bars">
              {PUMP_BARS.map((h, i) => (
                <i
                  key={i}
                  className={i >= PUMP_BARS.length - PUMP_SPIKES ? "is-spike" : undefined}
                  style={cssVars({ "--h": h, "--n": i })}
                />
              ))}
            </div>
            <span className="pump-badge">
              <b>BRETT</b>
              <em className="rx-num">▲ 182%</em>
              <span>1h · vol 6.4×</span>
            </span>
          </div>
        </li>
        <li className="bx bx--report reveal" style={cssVars({ "--d": ".12s" })}>
          <div className="bx__t bx__t--row">
            <img src="/landing/ic-report.webp" alt="" width={44} height={44} loading="lazy" decoding="async" />
            <div>
              <b>Full Report &amp; What&apos;s New</b>
              <span>A deep dive on any token, plus a running log of what changed since you last looked.</span>
            </div>
          </div>
          <div className="bx__viz viz-news" aria-hidden="true">
            <ul>
              <li>
                <i />
                <b>v2 rewards live</b>
                <span>2h</span>
              </li>
              <li>
                <i />
                <b>Listed on Coinbase</b>
                <span>1d</span>
              </li>
              <li className="is-old">
                <i />
                <b>Audit by Spearbit</b>
                <span>4d</span>
              </li>
            </ul>
            <span className="mk-new">
              <BoltIcon size={12} />2 new
            </span>
          </div>
        </li>
        <li className="bx reveal">
          <div className="bx__t bx__t--row">
            <img src="/landing/ic-exchange.webp" alt="" width={44} height={44} loading="lazy" decoding="async" />
            <div>
              <b>Exchange built in</b>
              <span>Swap from the token page or straight from a Claw answer. No wallet hopping.</span>
            </div>
          </div>
          <div className="bx__viz viz-swap" aria-hidden="true">
            <div className="sw-row">
              <span className="mk-label">Pay</span>
              <b className="rx-num">0.25</b>
              <span className="mk-tok">ETH</span>
            </div>
            <span className="sw-flip">⇅</span>
            <div className="sw-row">
              <span className="mk-label">Get</span>
              <b className="rx-num">702.4</b>
              <span className="mk-tok mk-tok--a">AERO</span>
            </div>
          </div>
        </li>
        <li className="bx reveal" style={cssVars({ "--d": ".06s" })}>
          <div className="bx__t bx__t--row">
            <img src="/landing/ic-search.webp" alt="" width={44} height={44} loading="lazy" decoding="async" />
            <div>
              <b>Search everything, ⌘K</b>
              <span>Tokens, markets, contract addresses and pages from one box. No result? Ask Claw.</span>
            </div>
          </div>
          <div className="bx__viz viz-search" aria-hidden="true">
            <div className="sr-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.2" />
                <path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <SearchTyping />
              <i />
              <kbd>⌘K</kbd>
            </div>
            <ul className="sr-res">
              <li>
                <b>AERO</b>
                <span>Aerodrome · Base</span>
              </li>
              <li>
                <b>Fed cut in Dec?</b>
                <span>Market · 62% Yes</span>
              </li>
              <li className="sr-claw">Ask Claw about “aer…”</li>
            </ul>
          </div>
        </li>
        <li className="bx reveal" style={cssVars({ "--d": ".12s" })}>
          <div className="bx__t bx__t--row">
            <img src="/landing/ic-layout.webp" alt="" width={44} height={44} loading="lazy" decoding="async" />
            <div>
              <b>Your terminal, your layout</b>
              <span>Drag the panels, minimise what you don&apos;t need, keep the chart full width when it matters.</span>
            </div>
          </div>
          <div className="bx__viz viz-layout" aria-hidden="true">
            <div className="ly">
              <i className="ly__chart">
                <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path
                    d="M0 32 L12 28 L22 30 L34 22 L46 24 L58 15 L70 18 L82 9 L100 5"
                    fill="none"
                    stroke="#45E3A3"
                    strokeWidth="1.6"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </i>
              <i className="ly__side" />
              <i className="ly__foot" />
            </div>
          </div>
        </li>
      </Bento>
    </section>
  );
}

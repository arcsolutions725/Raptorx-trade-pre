import Link from "next/link";
import { cssVars } from "./motion";

/** PREDICTIONS: Rex Predictions market with odds chart, order ticket and phone. */
export default function Predictions() {
  return (
    <section className="pred" id="predictions" aria-labelledby="pred-title">
      <div className="pred__copy reveal">
        <p className="eyebrow">Rex Predictions</p>
        <h2 id="pred-title">
          Every market.
          <br />
          One screen.
        </h2>
        <p>
          Elections, sports, crypto, the economy. Five prediction venues come together in one list, with live odds and
          the same clean order ticket.
        </p>
        <ul className="ticks">
          <li>
            <b>Rex Pilot</b> sits next to every market: a situation brief, the key numbers and a chat that knows the event.
          </li>
          <li>
            <b>Odds you can read.</b> One chart, one scale, the current price tagged on the axis.
          </li>
          <li>
            <b>Buy Yes or No</b> in a couple of taps, then track it in My orders and positions.
          </li>
        </ul>
        <Link className="rx-btn rx-btn--primary js-ring" href="/rexmarkets">
          Explore Rex Predictions
        </Link>
      </div>
      <div className="pred__stage reveal" style={cssVars({ "--d": ".1s" })}>
        <figure className="frame">
          <div className="frame__bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>Rex Predictions</span>
          </div>
          <div className="mk-mkt" role="img" aria-label="A prediction market with an odds chart, a Yes/No order ticket and a Rex Pilot brief">
            <div className="mk-mkt__main" aria-hidden="true">
              <div className="mk-mkt__head">
                <span className="mk-q">🏛</span>
                <div>
                  <b>Will the Fed cut rates in December?</b>
                  <span>
                    Economy · Ends Dec 10 · <em className="rx-num">$14.2M</em> volume
                  </span>
                </div>
              </div>
              <div className="mk-legend">
                <span>
                  <i style={{ background: "#45E3A3" }} />
                  Yes{" "}
                  <b className="rx-num" data-mk="yes">
                    62%
                  </b>
                </span>
                <span>
                  <i style={{ background: "#FF5C5C" }} />
                  No <b className="rx-num">38%</b>
                </span>
                <div className="mk-chips">
                  <span>1D</span>
                  <span className="is-on">1W</span>
                  <span>1M</span>
                  <span>All</span>
                </div>
              </div>
              <div className="mk-odds-wrap">
                <svg className="mk-odds" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">
                  <g stroke="rgba(255,255,255,.06)">
                    <path d="M0 40H400M0 80H400M0 120H400" />
                  </g>
                  <path
                    className="mk-draw"
                    pathLength={1}
                    d="M0 92 L25 88 L50 90 L75 80 L100 84 L125 74 L150 76 L175 66 L200 70 L225 60 L250 63 L275 55 L300 58 L325 50 L350 52 L375 46 L400 48"
                    fill="none"
                    stroke="#45E3A3"
                    strokeWidth="2.4"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    className="mk-draw"
                    pathLength={1}
                    d="M0 68 L25 72 L50 70 L75 80 L100 76 L125 86 L150 84 L175 94 L200 90 L225 100 L250 97 L275 105 L300 102 L325 110 L350 108 L375 114 L400 112"
                    fill="none"
                    stroke="#FF5C5C"
                    strokeWidth="2.4"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <span className="mk-axis mk-axis--y rx-num">62%</span>
                <span className="mk-axis mk-axis--n rx-num">38%</span>
              </div>
              <div className="mk-pilot">
                <img src="/images/claw-mini.svg" alt="" width={16} height={16} loading="lazy" decoding="async" />
                <div>
                  <b>Rex Pilot brief</b>
                  <span>CPI cooled to 2.6% and two Fed speakers sounded open to a cut. Odds rose 9 pts this week.</span>
                </div>
              </div>
            </div>
            <div className="mk mk-ticket" aria-hidden="true">
              <div className="mk-tabs">
                <span className="is-on">Buy</span>
                <span>Sell</span>
              </div>
              <div className="mk-yn">
                <span className="is-yes">
                  Yes <b className="rx-num">62¢</b>
                </span>
                <span className="is-no">
                  No <b className="rx-num">38¢</b>
                </span>
              </div>
              <div className="mk-field">
                <span className="mk-label">Amount</span>
                <div>
                  <b className="rx-num">$100</b>
                </div>
              </div>
              <div className="mk-quick">
                <span>+$10</span>
                <span>+$50</span>
                <span className="is-on">+$100</span>
              </div>
              <dl className="mk-quote">
                <div>
                  <dt>Shares</dt>
                  <dd className="rx-num">161.3</dd>
                </div>
                <div>
                  <dt>Payout if Yes</dt>
                  <dd className="rx-num mk-up">$161.29</dd>
                </div>
              </dl>
              <span className="mk-btn mk-btn--yes">Buy Yes</span>
            </div>
          </div>
        </figure>
        <figure className="phone" aria-hidden="true">
          <div className="ph">
            <div className="ph__bar">
              <span>9:41</span>
              <i />
            </div>
            <div className="ph-mkt">
              <span className="mk-q">🏛</span>
              <b>Will the Fed cut rates in December?</b>
              <div className="ph-big">
                <b className="rx-num">62%</b>
                <span className="mk-up">▲ 9 pts</span>
              </div>
              <svg viewBox="0 0 200 70" preserveAspectRatio="none">
                <path
                  className="mk-draw"
                  pathLength={1}
                  d="M0 52 L20 50 L40 51 L60 44 L80 46 L100 38 L120 40 L140 32 L160 34 L180 26 L200 24"
                  fill="none"
                  stroke="#45E3A3"
                  strokeWidth="2.2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="ph-yn">
                <span className="is-yes">Yes 62¢</span>
                <span className="is-no">No 38¢</span>
              </div>
              <div className="ph-pilot">
                <b>Rex Pilot</b>
                <span>CPI cooled, odds up 9 pts this week.</span>
              </div>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}

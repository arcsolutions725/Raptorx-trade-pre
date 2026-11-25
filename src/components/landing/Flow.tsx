import FlowTrack from "./FlowTrack";
import { BoltIcon } from "./icons";
import { cssVars } from "./motion";

/** FLOW: research → trade, one trade start to finish on a gold track. */
export default function Flow() {
  return (
    <section className="flow" id="flow" aria-labelledby="flow-title">
      <div className="sec-head reveal">
        <h2 id="flow-title">
          From Research to Trade.
          <br />
          In One Workflow.
        </h2>
        <p>
          Discover and hunt any digital asset or prediction event with our powerful AI, understand real-time
          movements, and deploy capital intelligently in one workflow.
        </p>
      </div>
      <FlowTrack>
        <li className="jr__step" style={cssVars({ "--i": 0 })}>
          <div className="jr__head">
            <span className="jr__dot" aria-hidden="true" />
            <span className="jr__lbl">
              <span className="jr__time rx-num">09:41</span>
              <b>Spot it</b>
            </span>
          </div>
          <div className="jr__card">
            <div className="jr__viz jv-scr" aria-hidden="true">
              <div className="jv-scr__row is-hot">
                <span className="rx-num">1</span>
                <img className="tk-logo" src="/landing/tokens/aero.webp" alt="" width={22} height={22} />
                <b>AERO</b>
                <em className="rx-num mk-up">+6.4%</em>
                <i className="jv-up">▲ 3</i>
              </div>
              <div className="jv-scr__row">
                <span className="rx-num">2</span>
                <img className="tk-logo" src="/landing/tokens/vvv.webp" alt="" width={22} height={22} />
                <b>VVV</b>
                <em className="rx-num mk-up">+2.1%</em>
              </div>
              <div className="jv-scr__row">
                <span className="rx-num">3</span>
                <img className="tk-logo" src="/landing/tokens/virtual.webp" alt="" width={22} height={22} />
                <b>VIRTUAL</b>
                <em className="rx-num mk-up">+1.8%</em>
              </div>
              <div className="jv-scr__row">
                <span className="rx-num">4</span>
                <img className="tk-logo" src="/landing/tokens/morpho.webp" alt="" width={22} height={22} />
                <b>MORPHO</b>
                <em className="rx-num mk-dn">−1.2%</em>
              </div>
            </div>
            <p>RexScreener ranks live tokens by volume, momentum and age. AERO just climbed to the top.</p>
          </div>
        </li>
        <li className="jr__step" style={cssVars({ "--i": 1 })}>
          <div className="jr__head">
            <span className="jr__dot" aria-hidden="true" />
            <span className="jr__lbl">
              <span className="jr__time rx-num">09:42</span>
              <b>Understand it</b>
            </span>
          </div>
          <div className="jr__card">
            <div className="jr__viz jv-rep" aria-hidden="true">
              <div className="jv-rep__top">
                <img className="tk-logo" src="/landing/tokens/aero.webp" alt="" width={30} height={30} />
                <div>
                  <span className="mk-label">Golden Report</span>
                  <b>Aerodrome</b>
                </div>
                <span className="mk-new">
                  <BoltIcon size={11} ariaHidden />2 new
                </span>
              </div>
              <div className="jv-rep__nums">
                <div>
                  <span className="mk-label">Mcap</span>
                  <b className="rx-num">$475.5M</b>
                </div>
                <div>
                  <span className="mk-label">Vol 24h</span>
                  <b className="rx-num">$38.2M</b>
                </div>
              </div>
              <svg viewBox="0 0 200 40" preserveAspectRatio="none">
                <path
                  className="jv-line"
                  pathLength={1}
                  d="M0 33 L20 30 L40 31 L60 25 L80 27 L100 20 L120 22 L140 15 L160 17 L180 9 L200 6"
                  fill="none"
                  stroke="#45E3A3"
                  strokeWidth="2.2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <p>One click opens the Golden Report: real team, market cap and volume up front, and what changed this week.</p>
          </div>
        </li>
        <li className="jr__step" style={cssVars({ "--i": 2 })}>
          <div className="jr__head">
            <span className="jr__dot" aria-hidden="true" />
            <span className="jr__lbl">
              <span className="jr__time rx-num">09:43</span>
              <b>Ask about it</b>
            </span>
          </div>
          <div className="jr__card">
            <div className="jr__viz jv-ask" aria-hidden="true">
              <div className="jv-ask__q">Is AERO worth a look today?</div>
              <div className="jv-ask__a">
                <img src="/landing/claw-logo-96.webp" alt="" width={18} height={18} />
                <div>
                  <b>Bullish bias on the 4h.</b>
                  <span>Volume up 38%, price holding support.</span>
                </div>
              </div>
              <div className="jv-ask__lv">
                <span>
                  Support <b className="rx-num">$1.12</b>
                </span>
                <span>
                  Target <b className="rx-num">$1.38</b>
                </span>
              </div>
            </div>
            <p>Claw AI 5.0 answers in plain language: levels, risks and what changed. Then it hands you the trade.</p>
          </div>
        </li>
        <li className="jr__step" style={cssVars({ "--i": 3 })}>
          <div className="jr__head">
            <span className="jr__dot" aria-hidden="true" />
            <span className="jr__lbl">
              <span className="jr__time rx-num">09:44</span>
              <b>Trade it</b>
            </span>
          </div>
          <div className="jr__card">
            <div className="jr__viz jv-buy" aria-hidden="true">
              <div className="jv-buy__row">
                <span className="mk-label">Pay</span>
                <b className="rx-num">0.25</b>
                <span className="mk-tok">
                  <img className="tk-logo" src="/landing/tokens/eth.webp" alt="" width={16} height={16} />
                  ETH
                </span>
              </div>
              <div className="jv-buy__row">
                <span className="mk-label">Get</span>
                <b className="rx-num">702.4</b>
                <span className="mk-tok mk-tok--a">
                  <img className="tk-logo" src="/landing/tokens/aero.webp" alt="" width={16} height={16} />
                  AERO
                </span>
              </div>
              <span className="jv-buy__btn">Buy AERO</span>
              <span className="jv-buy__ok">
                <i>✓</i>Filled · 702.4 AERO
              </span>
            </div>
            <p>Swap right from the token page, or take a Yes or No position on a market. No wallet hopping.</p>
          </div>
        </li>
      </FlowTrack>
    </section>
  );
}

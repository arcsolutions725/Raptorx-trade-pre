import Link from "next/link";
import { cssVars } from "./motion";

// token logos live in /landing/tokens/<symbol lowercased>.webp
const SCREENER_ROWS: [sym: string, mcap: string, chg: string][] = [
  ["AERO", "$475M", "+4.2%"],
  ["BRETT", "$842M", "+2.1%"],
  ["VIRTUAL", "$1.3B", "+6.4%"],
  ["DEGEN", "$96M", "+11%"],
  ["TOSHI", "$188M", "+3.0%"],
  ["MOG", "$612M", "+1.4%"],
];

function PhoneBar() {
  return (
    <div className="ph__bar">
      <span>9:41</span>
      <i />
    </div>
  );
}

/** MOBILE: the same terminal on three phones. */
export default function MobileSection() {
  return (
    <section className="mobile" aria-labelledby="mb-title">
      <div className="sec-head sec-head--center reveal">
        <h2 id="mb-title">Desktop or Mobile, the Raptor hunts with you.</h2>
        <p>Hunt with Claw AI 5.0 and trade wherever you go.</p>
      </div>
      <div className="phones" role="group" aria-label="RexScreener, Claw AI 5.0 and a prediction market on a phone">
        <figure className="phone reveal" aria-hidden="true">
          <div className="ph">
            <PhoneBar />
            <div className="ph-scr">
              <b>RexScreener</b>
              <div className="mk-chips">
                <span className="is-on">Base</span>
                <span>Trending</span>
                <span>New</span>
              </div>
              <ul>
                {SCREENER_ROWS.map(([sym, mcap, chg]) => (
                  <li key={sym}>
                    <img
                      className="tk-logo"
                      src={`/landing/tokens/${sym.toLowerCase()}.webp`}
                      alt=""
                      width={22}
                      height={22}
                      loading="lazy"
                      decoding="async"
                    />
                    <b>{sym}</b>
                    <span className="rx-num">{mcap}</span>
                    <em className="mk-up rx-num">{chg}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </figure>
        <figure className="phone phone--mid reveal" style={cssVars({ "--d": ".08s" })} aria-hidden="true">
          <div className="ph">
            <PhoneBar />
            <div className="ph-claw">
              <img className="claw-logo" src="/landing/claw-logo-96.webp" alt="" width={32} height={32} loading="lazy" decoding="async" />
              <b>Claw AI 5.0</b>
              <div className="mk-msg mk-msg--me">Hottest AI markets today?</div>
              <div className="ph-claw__ans">
                <p>Three are moving fastest:</p>
                <ol>
                  <li>
                    OpenAI ships GPT-6 by March <em className="rx-num">41%</em>
                  </li>
                  <li>
                    Nvidia above $200 Friday <em className="rx-num">58%</em>
                  </li>
                  <li>
                    AI bill passes Senate <em className="rx-num">22%</em>
                  </li>
                </ol>
                <Link className="mk-cta" href="/rexmarkets">
                  Trade on RaptorX
                </Link>
              </div>
              <div className="mk-composer">
                <span>Ask anything…</span>
                <i>
                  <img className="claw-logo" src="/landing/claw-logo-96.webp" alt="" width={20} height={20} loading="lazy" decoding="async" />
                </i>
              </div>
            </div>
          </div>
        </figure>
        <figure className="phone reveal" style={cssVars({ "--d": ".16s" })} aria-hidden="true">
          <div className="ph">
            <PhoneBar />
            <div className="ph-mkt">
              <span className="mk-q">🏈</span>
              <b>Chiefs win the Super Bowl?</b>
              <div className="ph-big">
                <b className="rx-num">27%</b>
                <span className="mk-up">▲ 3 pts</span>
              </div>
              <svg viewBox="0 0 200 70" preserveAspectRatio="none">
                <path
                  className="mk-draw"
                  pathLength={1}
                  d="M0 50 L25 54 L50 48 L75 52 L100 44 L125 46 L150 40 L175 42 L200 36"
                  fill="none"
                  stroke="#45E3A3"
                  strokeWidth="2.2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="ph-yn">
                <span className="is-yes">Yes 27¢</span>
                <span className="is-no">No 73¢</span>
              </div>
              <div className="ph-pilot">
                <b>Rex Pilot</b>
                <span>Starting QB cleared to play Sunday.</span>
              </div>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}

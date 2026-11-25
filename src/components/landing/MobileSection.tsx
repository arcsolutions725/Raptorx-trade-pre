import { cssVars } from "./motion";

const SCREENER_ROWS: [avatar: string, sym: string, mcap: string, chg: string][] = [
  ["eagle", "AERO", "$475M", "+4.2%"],
  ["fox", "BRETT", "$842M", "+2.1%"],
  ["falcon", "VIRTUAL", "$1.3B", "+6.4%"],
  ["raven", "DEGEN", "$96M", "+11%"],
  ["wolf", "TOSHI", "$188M", "+3.0%"],
  ["shark", "MOG", "$612M", "+1.4%"],
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
        <p className="eyebrow">Desktop or phone</p>
        <h2 id="mb-title">Hunt on the go.</h2>
        <p>The same terminal, rebuilt for one hand. Screener, Claw and markets, wherever you are.</p>
      </div>
      <div className="phones" role="img" aria-label="RexScreener, Claw AI 5.0 and a prediction market on a phone">
        <figure className="phone reveal" aria-hidden="true">
          <div className="ph">
            <PhoneBar />
            <div className="ph-scr">
              <b>RexScreener</b>
              <div className="mk-chips">
                <span className="is-on">All</span>
                <span>Base</span>
                <span>Solana</span>
              </div>
              <ul>
                {SCREENER_ROWS.map(([av, sym, mcap, chg]) => (
                  <li key={sym}>
                    <img src={`/landing/avatars/${av}.webp`} alt="" width={22} height={22} loading="lazy" decoding="async" />
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
              <img src="/images/claw-mini.svg" alt="" width={28} height={28} loading="lazy" decoding="async" />
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
                <span className="mk-cta">Trade on RaptorX</span>
              </div>
              <div className="mk-composer">
                <span>Ask anything…</span>
                <i />
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

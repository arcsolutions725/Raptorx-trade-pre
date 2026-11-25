import { cssVars } from "./motion";
import { TierBadge } from "./tiers";

const TIER_ROWS: [key: string, name: string, pts: string][] = [
  ["hatchling", "Hatchling", "Start"],
  ["fledgling", "Fledgling", "10K pts"],
  ["talon", "Talon", "30K pts"],
  ["raptor", "Raptor", "60K pts"],
  ["apex", "Apex", "100K pts"],
];

const AVATARS = ["giraffe", "panda", "dragon", "falcon", "bear", "fox", "raven", "zebra", "eagle", "shark", "wolf", "tiger"];

/** REWARDS: missions, tiers and the leaderboard. */
export default function Rewards() {
  return (
    <section className="rewards" id="rewards" aria-labelledby="rw-title">
      <div className="sec-head reveal">
        <h2 id="rw-title">
          Climb from Hatchling
          <br />
          to Apex.
        </h2>
        <p>
          Daily missions pay points for the research you&apos;d do anyway. Points move you up the tiers and up the season
          leaderboard.
        </p>
      </div>
      <ol className="tiers reveal" aria-label="Tiers, scrolls sideways" tabIndex={0}>
        {TIER_ROWS.map(([k, name, pts]) => (
          <li key={k}>
            <span className="tb" data-tier={k}>
              <TierBadge tierKey={k} size={40} />
            </span>
            <b>{name}</b>
            <span className="rx-num">{pts}</span>
          </li>
        ))}
      </ol>
      <div className="rewards__grid">
        <figure className="rw-card reveal">
          <figcaption>
            <b>Become a legend</b>
            <span>The season&apos;s top traders, live.</span>
          </figcaption>
          <div className="mk-lb" role="img" aria-label="Leaderboard with the top three traders on a podium">
            <div className="podium" aria-hidden="true">
              <div className="pd pd--2">
                <img src="/landing/avatars/wolf.webp" alt="" width={52} height={52} loading="lazy" decoding="async" />
                <b>wolf.eth</b>
                <span className="rx-num">84.2K</span>
                <i>2</i>
              </div>
              <div className="pd pd--1">
                <img src="/landing/avatars/dragon.webp" alt="" width={64} height={64} loading="lazy" decoding="async" />
                <b>dragonfly</b>
                <span className="rx-num">112.9K</span>
                <i>1</i>
              </div>
              <div className="pd pd--3">
                <img src="/landing/avatars/fox.webp" alt="" width={48} height={48} loading="lazy" decoding="async" />
                <b>slyfox</b>
                <span className="rx-num">71.5K</span>
                <i>3</i>
              </div>
            </div>
            <ol className="lb-rows" start={4} aria-hidden="true">
              <li>
                <span className="rx-num">4</span>
                <img src="/landing/avatars/eagle.webp" alt="" width={26} height={26} loading="lazy" decoding="async" />
                <b>eaglEye</b>
                <em className="rx-num">64.1K</em>
              </li>
              <li>
                <span className="rx-num">5</span>
                <img src="/landing/avatars/shark.webp" alt="" width={26} height={26} loading="lazy" decoding="async" />
                <b>deepshark</b>
                <em className="rx-num">58.8K</em>
              </li>
              <li className="is-you">
                <span className="rx-num">27</span>
                <img src="/landing/avatars/panda.webp" alt="" width={26} height={26} loading="lazy" decoding="async" />
                <b>You</b>
                <em className="rx-num">21.4K</em>
              </li>
            </ol>
          </div>
        </figure>
        <figure className="rw-card reveal" style={cssVars({ "--d": ".08s" })}>
          <figcaption>
            <b>Earn while you research</b>
            <span>Two missions a day, 100 points a task.</span>
          </figcaption>
          <div className="mk-ms" role="img" aria-label="Daily missions with a progress ring and two tasks">
            <div className="ms-ring" aria-hidden="true">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="10" />
                <circle
                  className="ms-ring__p"
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="url(#msG)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  pathLength={100}
                  transform="rotate(-90 60 60)"
                />
                <defs>
                  <linearGradient id="msG">
                    <stop offset="0" stopColor="#FFD15C" />
                    <stop offset="1" stopColor="#FF6A13" />
                  </linearGradient>
                </defs>
              </svg>
              <div>
                <b className="rx-num">1/2</b>
                <span>done today</span>
              </div>
            </div>
            <ul className="ms-list" aria-hidden="true">
              <li className="is-done">
                <i>✓</i>
                <div>
                  <b>Read a Golden Report</b>
                  <span>Any project, 30 seconds</span>
                </div>
                <em className="rx-num">+100</em>
              </li>
              <li>
                <i />
                <div>
                  <b>Ask Claw about a market</b>
                  <span>One question is enough</span>
                </div>
                <em className="rx-num">+100</em>
              </li>
            </ul>
            <span className="ms-streak" aria-hidden="true">
              🔥 6-day streak · resets in <b className="rx-num">07:42:18</b>
            </span>
          </div>
        </figure>
        <div className="rw-avatars reveal" style={cssVars({ "--d": ".16s" })}>
          <b>Every hunter gets a face</b>
          <span>Twelve raptor-crew avatars, one for every animal handle.</span>
          <div className="av-grid" aria-hidden="true">
            {AVATARS.map((a) => (
              <img key={a} src={`/landing/avatars/${a}.webp`} alt="" width={72} height={72} loading="lazy" decoding="async" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

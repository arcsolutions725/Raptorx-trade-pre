import ClawChat from "./ClawChat";
import { cssVars } from "./motion";

/** CLAW: the Claw AI 5.0 window with its thinking checklist. */
export default function ClawSection() {
  return (
    <section className="claw" id="claw" aria-labelledby="claw-title">
      <div className="claw__aura" aria-hidden="true" />
      <div className="sec-head sec-head--center reveal">
        <img className="claw__mark" src="/landing/claw-hero.webp" alt="" width={120} height={120} loading="lazy" decoding="async" />
        <h2 id="claw-title">
          Claw AI 5.0.<span className="h2-sub">The World’s Most Powerful Model for Internet Markets.</span>
        </h2>
        <p className="sec-lead">
          The Proprietary Engine for Prediction Markets &amp; Crypto. Paste a contract address, hunt a prediction event
          or just ask what’s moving. Claw AI 5.0 leverages private datasets and OSINT to give you real-time market
          intelligence and context so you can deploy capital intelligently without any guesswork.
        </p>
      </div>
      <ul className="chips reveal" aria-label="Things to ask Claw">
        <li>What are the odds the Fed cuts in December?</li>
        <li>Is $VVV leaning bullish on the 15m?</li>
        <li>Hottest AI markets today</li>
        <li>Where is the arbitrage between venues?</li>
      </ul>
      <figure className="frame frame--glow claw__frame reveal">
        <div className="frame__bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>Claw AI 5.0</span>
        </div>
        <ClawChat />
      </figure>
      <ul className="pillars">
        <li className="reveal">
          <b>Built on Proprietary Datasets</b>
          <span>
            When Claw AI is queried, it leverages data sourced from thousands of private trading telegram groups and
            combines it with open-source intel to give you the most relevant intel in real-time.
          </span>
        </li>
        <li className="reveal" style={cssVars({ "--d": ".08s" })}>
          <b>On-Demand Research Reports covering Internet Markets 24/7</b>
          <span>Every response is a human-friendly research report that you can rely on to deploy capital intelligently.</span>
        </li>
        <li className="reveal" style={cssVars({ "--d": ".16s" })}>
          <b>From Intel to Trade</b>
          <span>
            Every research report and intel is actionable, empowering traders to directly trade within the platform
            without jumping through multiple hoops or exiting the ecosystem.
          </span>
        </li>
      </ul>
    </section>
  );
}

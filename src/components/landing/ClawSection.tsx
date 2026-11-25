import ClawChat from "./ClawChat";
import { cssVars } from "./motion";

/** CLAW: the Claw AI 5.0 window with its thinking checklist. */
export default function ClawSection() {
  return (
    <section className="claw" id="claw" aria-labelledby="claw-title">
      <div className="claw__aura" aria-hidden="true" />
      <div className="sec-head sec-head--center reveal">
        <img className="claw__mark" src="/landing/claw-hero.webp" alt="" width={120} height={120} loading="lazy" decoding="async" />
        <p className="eyebrow">Claw AI 5.0</p>
        <h2 id="claw-title">
          Ask anything.
          <br />
          Watch it think.
        </h2>
        <p>
          The thinking engine for prediction markets and crypto. Paste a contract address, name a market or just ask
          what&apos;s moving. Claw shows its work, then writes the answer.
        </p>
      </div>
      <ul className="chips reveal" aria-label="Things to ask Claw">
        <li>What are the odds the Fed cuts in December?</li>
        <li>Is $SOL leaning bullish on the 15m?</li>
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
          <b>Shows its thinking</b>
          <span>Watch Claw scan sources and check data live, instead of a spinner.</span>
        </li>
        <li className="reveal" style={cssVars({ "--d": ".08s" })}>
          <b>Deep analysis on demand</b>
          <span>Turn any answer into a full report with levels, catalysts and risks.</span>
        </li>
        <li className="reveal" style={cssVars({ "--d": ".16s" })}>
          <b>Ends in a trade</b>
          <span>Every report finishes with Trade on RaptorX, right where you are.</span>
        </li>
      </ul>
    </section>
  );
}

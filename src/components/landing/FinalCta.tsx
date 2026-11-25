import Link from "next/link";
import { ArrowIcon } from "./icons";
import { cssVars } from "./motion";

/** FINAL CTA */
export default function FinalCta() {
  return (
    <section className="final" aria-labelledby="final-title">
      <div className="final__glow" aria-hidden="true" />
      <img
        className="final__logo reveal"
        src="/images/raptorx-logo.svg"
        alt="RaptorX"
        width={240}
        height={189}
        loading="lazy"
        decoding="async"
      />
      <h2 id="final-title" className="reveal" style={cssVars({ "--d": ".06s" })}>
        Stop missing the moves that cost millions.<span>Hunt intelligently with RaptorX.</span>
      </h2>
      <Link className="rx-btn rx-btn--primary js-ring rx-btn--l reveal" style={cssVars({ "--d": ".18s" })} href="/base">
        Enter RaptorX
        <ArrowIcon size={18} />
      </Link>
    </section>
  );
}

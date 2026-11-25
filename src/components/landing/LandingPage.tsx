import "./landing.css";
import ClawSection from "./ClawSection";
import Compare from "./Compare";
import Features from "./Features";
import FinalCta from "./FinalCta";
import Flow from "./Flow";
import Hero from "./Hero";
import LandingFooter from "./LandingFooter";
import LandingNav from "./LandingNav";
import LandingPreloads from "./LandingPreloads";
import LandingRoot from "./LandingRoot";
import MobileSection from "./MobileSection";
import Predictions from "./Predictions";
import Rewards from "./Rewards";
import Statement from "./Statement";

// Without JavaScript nothing would fade in, so show everything (the prototype's <noscript> style,
// scoped like landing.css; filter:none added so the .reveal blur doesn't stay on).
const NOSCRIPT_CSS =
  ":where(.lp) .reveal,:where(.lp) .gc,:where(.lp) .mk-ans,:where(.lp) .scene{opacity:1!important;visibility:visible!important;transform:none!important;filter:none!important}:where(.lp) .mk-draw{stroke-dashoffset:0!important}";

/** The RaptorX landing page, ported from design/index.html. */
export default function LandingPage() {
  return (
    <LandingRoot>
      <LandingPreloads />
      <noscript>
        <style>{NOSCRIPT_CSS}</style>
      </noscript>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <Hero />
        <Statement />
        <Flow />
        <ClawSection />
        <Predictions />
        <Features />
        <Compare />
        <Rewards />
        <MobileSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </LandingRoot>
  );
}

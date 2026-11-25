"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowIcon } from "./icons";

export default function LandingNav() {
  const ref = useRef<HTMLElement>(null);

  // nav gets a firmer background once you scroll
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="lp-nav" id="top" ref={ref}>
      <a className="lp-nav__logo" href="#top" aria-label="RaptorX home">
        <img src="/images/raptorx-logo.svg" alt="RaptorX" width={58} height={46} />
      </a>
      <nav className="lp-nav__links" aria-label="Sections">
        <a href="#flow">How it works</a>
        <a href="#claw">Claw AI</a>
        <a href="#predictions">Predictions</a>
        <a href="#rewards">Rewards</a>
      </nav>
      <Link className="rx-btn rx-btn--primary js-ring lp-enter" href="/base">
        Enter
        <ArrowIcon size={16} />
      </Link>
    </header>
  );
}

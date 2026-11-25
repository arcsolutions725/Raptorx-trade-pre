import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="lp-foot">
      <div className="lp-foot__top">
        <div className="lp-foot__brand">
          <img src="/images/raptorx-logo.svg" alt="RaptorX" width={52} height={41} loading="lazy" decoding="async" />
          <p className="lp-foot__note">
            © 2026 RaptorX. Trading crypto and prediction markets carries risk. Nothing on RaptorX is financial advice.
          </p>
        </div>
        <nav aria-label="Product">
          <b>Product</b>
          <Link href="/base">RexScreener</Link>
          <Link href="/claw-v5">Claw AI 5.0</Link>
          <Link href="/rexmarkets">Rex Predictions</Link>
          {/* Golden Reports is a filter inside RexScreener, with no URL of its own */}
          <Link href="/base">Golden Reports</Link>
        </nav>
        <nav aria-label="Community">
          <b>Community</b>
          <a href="https://www.x.com/huntonraptor" target="_blank" rel="noopener noreferrer">
            X
          </a>
          <a href="https://t.me/huntonraptor" target="_blank" rel="noopener noreferrer">
            Telegram
          </a>
        </nav>
        <nav aria-label="Legal">
          <b>Legal</b>
          {/* the prototype links https://www.raptorx.trade/docs/TermsofService-RaptorX.pdf: this same file on this site */}
          <a href="/docs/TermsofService-RaptorX.pdf" target="_blank" rel="noopener noreferrer">
            Terms of service
          </a>
        </nav>
      </div>
    </footer>
  );
}

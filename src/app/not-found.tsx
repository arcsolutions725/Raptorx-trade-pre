import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import RexHeader from "@/components/ui/layout/Header";
import Footer from "@/components/ui/layout/Footer";
import "@/styles/pages/not-found.css";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The link may be old, or the token or market was removed. Head back to RexScreener, Rex Predictions or Claw AI 5.0.",
};

/** 404 for unmatched URLs and notFound() (design/404.html): the app header and footer around a centred card. */
export default function NotFound() {
  return (
    <div className="rx-404 relative flex h-screen w-full flex-col overflow-hidden">
      {/* The app header and footer. Unknown one-segment URLs (/foo) match the screener chain route;
          RexScreenerShell then renders only this page, so these are never doubled. */}
      <div className="rx-404__chrome">
        <RexHeader />
      </div>

      <main className="err" id="main">
        <section className="rx-raised err__card" aria-labelledby="err-title">
          <span className="err__code" aria-hidden="true">
            404
          </span>
          <h1 id="err-title">This page isn&apos;t on the chart</h1>
          <p>
            The link may be old, or the token or market was removed. Search for
            it, or head back to the screener.
          </p>
          <div className="err__acts">
            <Link className="rx-btn rx-btn--primary" href="/base">
              Back to RexScreener
            </Link>
            <Link className="rx-btn rx-btn--claw" href="/claw-v5">
              <Image
                className="claw-ico"
                src="/images/claw-logo-96.webp"
                alt=""
                width={18}
                height={18}
              />
              Ask Claw
            </Link>
          </div>
          <nav className="err__links" aria-label="Popular pages">
            <Link href="/">Home</Link>
            <Link href="/base">RexScreener</Link>
            <Link href="/rexmarkets">Rex Predictions</Link>
            <Link href="/claw-v5">Claw AI 5.0</Link>
          </nav>
        </section>
      </main>

      <div className="rx-404__chrome rx-404__chrome--foot">
        <Footer />
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { TermsOfServiceModal } from "@/components/ui/modal/TermsOfServiceModal";
import {
  isRexScreenerPathname,
  REX_SCREENER_ALL_HREF,
} from "@/lib/rexscreenerRoutes";
import { markClawV5ScrollToInput } from "@/lib/clawV5/scrollIntent";
import {
  requestShellAction,
  REX_SCREENER_EXCHANGE_HREF,
} from "@/components/ui/layout/shellActions";

interface CryptoToken {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  image?: string;
}

/** Tab bar glyphs (same strokes as the design's icon sprite). */
const TAB_ICONS = {
  list: "M4 6h16M4 12h16M4 18h10",
  swap: "M7 7h12l-3-3M17 17H5l3 3",
} as const;

function TabIcon({ kind }: { kind: "list" | "clock" | "swap" | "user" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {kind === "clock" ? (
        <>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : kind === "user" ? (
        <>
          <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <path
          d={TAB_ICONS[kind]}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * App footer (RaptorX design: `.app-foot`).
 * Desktop: one line · [dock] | live crypto prices | legal links.
 * Phones: a slim live-prices line above the bottom tab bar (Screener · Predictions · Claw AI · Exchange · Account).
 * Live prediction markets run in the bar above the header (PredictionsTicker).
 */
export default function Footer({
  dock,
}: {
  /** Optional left slot on desktop (RexScreener: Daily missions + Leaderboard). */
  dock?: ReactNode;
} = {}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const isScreener = isRexScreenerPathname(pathname);
  const isPredictions =
    pathname === "/rexmarkets" || pathname.startsWith("/rexmarkets/");
  const isClaw = pathname === "/claw-v5" || pathname.startsWith("/claw-v5/");

  const [cryptoTokens, setCryptoTokens] = useState<CryptoToken[]>([]);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    const fetchCryptoTokens = async () => {
      try {
        const res = await fetch("/api/crypto/top", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setCryptoTokens(Array.isArray(data?.tokens) ? data.tokens : []);
        }
      } catch (error) {
        console.error("Failed to fetch crypto tokens:", error);
      }
    };

    fetchCryptoTokens();
    const interval = setInterval(fetchCryptoTokens, 30000);
    return () => clearInterval(interval);
  }, []);

  // Duplicated once for a seamless loop
  const loop = cryptoTokens.length > 0 ? [...cryptoTokens, ...cryptoTokens] : [];

  const pct = (v: number) => (
    <span className={v < 0 ? "rx-down" : "rx-up"}>
      {v < 0 ? "▼" : "▲"} {Math.abs(v).toFixed(2)}%
    </span>
  );

  const openExchange = () => {
    if (!requestShellAction("exchange")) router.push(REX_SCREENER_EXCHANGE_HREF);
  };

  return (
    <footer className="rx-footer">
      <div className="rx-footer__bar">
        {dock ? <div className="rx-footer__dock">{dock}</div> : null}

        <div className="rx-ticker" role="region" aria-label="Live token prices">
          <span className="rx-badge rx-badge--live shrink-0">Live</span>
          <div className="rx-ticker__viewport">
            {loop.length > 0 ? (
              <div className="rx-ticker__track">
                {loop.map((t, index) => (
                  <span
                    key={`${t.id}-${index}`}
                    className="rx-ticker__item shrink-0"
                    aria-hidden={index >= cryptoTokens.length || undefined}
                  >
                    <span className="rx-ticker__sym">{t.symbol.toUpperCase()}</span>
                    <span>
                      $
                      {t.current_price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    {pct(t.price_change_percentage_24h)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <nav className="rx-footer__links" aria-label="Footer">
          <span>© {new Date().getFullYear()} RaptorX</span>
          <a
            href="/docs/TermsofService-RaptorX.pdf"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of service
          </a>
          <a
            href="https://x.com/huntonraptor"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RaptorX on X"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 4l16 16M20 4L4 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </a>
          <a
            href="https://t.me/huntonraptor"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RaptorX on Telegram"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M21 4L3 11l6 2 2 6 3-4 5 4z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </nav>
      </div>

      {/* Phones: main navigation */}
      <nav className="rx-tabbar" aria-label="Main">
        <Link
          href={REX_SCREENER_ALL_HREF}
          className="rx-tabbar__item"
          aria-current={isScreener ? "page" : undefined}
        >
          <TabIcon kind="list" />
          Screener
        </Link>
        <Link
          href="/rexmarkets"
          className="rx-tabbar__item"
          aria-current={isPredictions ? "page" : undefined}
        >
          <TabIcon kind="clock" />
          Predictions
        </Link>
        <Link
          href="/claw-v5"
          className="rx-tabbar__item rx-tabbar__item--claw"
          aria-current={isClaw ? "page" : undefined}
          onClick={() => {
            if (!isClaw) markClawV5ScrollToInput();
          }}
        >
          <span className="rx-tabbar__claw">
            <Image
              src="/images/claw-logo-96.webp"
              alt=""
              width={34}
              height={34}
              className="claw-ico"
            />
          </span>
          Claw AI
        </Link>
        <button type="button" className="rx-tabbar__item" onClick={openExchange}>
          <TabIcon kind="swap" />
          Exchange
        </button>
        <button
          type="button"
          className="rx-tabbar__item"
          onClick={() => requestShellAction("account")}
        >
          <TabIcon kind="user" />
          Account
        </button>
      </nav>

      <TermsOfServiceModal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
      />
    </footer>
  );
}

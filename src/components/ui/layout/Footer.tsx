/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { TermsOfServiceModal } from "@/components/ui/modal/TermsOfServiceModal";

interface CryptoToken {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  image?: string;
}

interface PredictionMarket {
  ticker: string;
  title: string;
  yes_price: number;
  no_price: number;
}

export default function Footer() {
  const pathname = usePathname();
  const isRexMarketsPage = pathname === "/rexmarkets";

  const [cryptoTokens, setCryptoTokens] = useState<CryptoToken[]>([]);
  const [predictionMarkets, setPredictionMarkets] = useState<
    PredictionMarket[]
  >([]);
  const [showTerms, setShowTerms] = useState(false);

  /* ---------------------------
      FETCH DATA: MAIN PAGE
  --------------------------- */
  useEffect(() => {
    if (!isRexMarketsPage) {
      const fetchCryptoTokens = async () => {
        try {
          const res = await fetch("/api/crypto/top", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            setCryptoTokens(data.tokens || []);
          }
        } catch (error) {
          console.error("Failed to fetch crypto tokens:", error);
        }
      };

      fetchCryptoTokens();
      const interval = setInterval(fetchCryptoTokens, 30000);
      return () => clearInterval(interval);
    }
  }, [isRexMarketsPage]);

  useEffect(() => {
    if (isRexMarketsPage) {
      const fetchPredictionMarkets = async () => {
        try {
          const res = await fetch("/api/kalshi/markets?limit=15&status=open", {
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            const markets = (data.markets || [])
              .slice(0, 15)
              .map((market: any) => ({
                ticker: market.ticker || "",
                title: market.title || "",
                yes_price: market.yes_price || 0,
                no_price: market.no_price || 0,
              }));

            setPredictionMarkets(markets);
          }
        } catch (error) {
          console.error("Failed to fetch prediction markets:", error);
        }
      };

      fetchPredictionMarkets();
      const interval = setInterval(fetchPredictionMarkets, 30000);
      return () => clearInterval(interval);
    }
  }, [isRexMarketsPage]);

  // Get all items and duplicate for seamless infinite scroll
  const allItems = isRexMarketsPage ? predictionMarkets : cryptoTokens;
  // Only duplicate if we have items, otherwise show empty
  const duplicatedItems = allItems.length > 0 ? [...allItems, ...allItems] : [];

  const pct = (v: number) => (
    <span className={v < 0 ? "rx-down" : "rx-up"}>
      {v < 0 ? "▼" : "▲"} {Math.abs(v).toFixed(2)}%
    </span>
  );

  return (
    <footer className="rx-footer">
      <div className="rx-footer__bar">
        <div className="rx-ticker">
          <span className="rx-badge rx-badge--live shrink-0">
            <span className="text-[12px] font-medium">Live</span>
          </span>
          <div
            className="rx-ticker__viewport h-10 flex items-center"
            aria-label={
              isRexMarketsPage ? "Live prediction markets" : "Live token prices"
            }
          >
            {duplicatedItems.length > 0 ? (
              <div className="flex items-center gap-[26px] animate-scroll-infinite whitespace-nowrap">
                {duplicatedItems.map((item, index) => (
                  <div
                    key={`${
                      isRexMarketsPage
                        ? (item as PredictionMarket).ticker
                        : (item as CryptoToken).id
                    }-${index}`}
                    className="rx-ticker__item shrink-0"
                    aria-hidden={index >= allItems.length || undefined}
                  >
                    {isRexMarketsPage ? (
                      <>
                        <span className="rx-ticker__q">
                          {(item as PredictionMarket).title}
                        </span>
                        <span className="rx-up">
                          Yes{" "}
                          {((item as PredictionMarket).yes_price * 100).toFixed(
                            1,
                          )}
                          %
                        </span>
                        <span className="rx-down">
                          No{" "}
                          {((item as PredictionMarket).no_price * 100).toFixed(
                            1,
                          )}
                          %
                        </span>
                      </>
                    ) : (
                      <>
                        {(item as CryptoToken).image && (
                          <Image
                            src={(item as CryptoToken).image!}
                            alt=""
                            width={16}
                            height={16}
                            className="rounded-full"
                            unoptimized
                          />
                        )}
                        <b>{(item as CryptoToken).symbol.toUpperCase()}</b>
                        <span>
                          $
                          {(item as CryptoToken).current_price.toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </span>
                        {pct((item as CryptoToken).price_change_percentage_24h)}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rx-footer__links">
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
            aria-label="Follow RaptorX on X"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.66675 13.3332L7.17875 8.82117M8.81875 7.18117L13.3334 2.6665M2.66675 2.6665L10.4887 13.3332H13.3334L5.51141 2.6665H2.66675Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <a
            href="https://t.me/huntonraptor"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join RaptorX on Telegram"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M10 6.6665L7.33333 9.33317L11.3333 13.3332L14 2.6665L2 7.33317L4.66667 8.6665L6 12.6665L8 9.99984"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>
      <TermsOfServiceModal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
      />
    </footer>
  );
}

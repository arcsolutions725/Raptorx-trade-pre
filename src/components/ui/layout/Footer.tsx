/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";

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
          const res = await fetch(
            "/api/kalshi/markets?limit=15&status=open,unopened",
            { cache: "no-store" }
          );
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

  return (
    <footer className="fixed bottom-0 left-0 right-0 w-full bg-[#141414] border-t-[0.5px] border-[#B58405]">
      <div className="w-full flex flex-col gap-2 sm:gap-0 sm:flex-row justify-center sm:justify-between items-center px-[12px] sm:px-5 py-2">
        <div className="flex items-center justify-center gap-2 sm:gap-4 sm:flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 bg-[#00B050] rounded-full live-dot-pulse" />
            <span className="text-white text-[12px] font-normal">Live</span>
          </div>

          <div className="flex-1 flex items-center min-w-0 overflow-hidden relative h-[40px]">
            {duplicatedItems.length > 0 ? (
              <div className="flex items-center gap-3 sm:gap-4 animate-scroll-infinite whitespace-nowrap">
                {duplicatedItems.map((item, index) => (
                  <div
                    key={`${
                      isRexMarketsPage
                        ? (item as PredictionMarket).ticker
                        : (item as CryptoToken).id
                    }-${index}`}
                    className="flex-shrink-0 flex items-center gap-2 sm:gap-3 min-w-0"
                  >
                    {isRexMarketsPage ? (
                      <div className="flex flex-col min-w-0">
                        <span className="text-white text-sm font-normal truncate max-w-[150px] sm:max-w-[200px]">
                          {(item as PredictionMarket).title}
                        </span>
                        <div className="flex gap-2 text-sm">
                          <span className="text-[#00B050]">
                            Yes:{" "}
                            {(
                              (item as PredictionMarket).yes_price * 100
                            ).toFixed(1)}
                            %
                          </span>
                          <span className="text-[#FF4444]">
                            No:{" "}
                            {(
                              (item as PredictionMarket).no_price * 100
                            ).toFixed(1)}
                            %
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {(item as CryptoToken).image && (
                          <Image
                            src={(item as CryptoToken).image!}
                            alt={(item as CryptoToken).symbol}
                            width={20}
                            height={20}
                            className="rounded-full"
                            unoptimized
                          />
                        )}
                        <span className="text-white text-sm font-normal">
                          ${(item as CryptoToken).symbol}:
                        </span>
                        <span className="text-white text-sm font-normal">
                          $
                          {(item as CryptoToken).current_price.toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          {(item as CryptoToken).price_change_percentage_24h <
                          0 ? (
                            <>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className="text-red-500"
                              >
                                <path
                                  d="M6 9L2 5H4V1H8V5H10L6 9Z"
                                  fill="currentColor"
                                />
                              </svg>
                              <span className="text-red-500 text-sm font-normal">
                                {Math.abs(
                                  (item as CryptoToken)
                                    .price_change_percentage_24h
                                ).toFixed(2)}
                                %
                              </span>
                            </>
                          ) : (
                            <>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className="text-green-500"
                              >
                                <path
                                  d="M6 3L10 7H8V11H4V7H2L6 3Z"
                                  fill="currentColor"
                                />
                              </svg>
                              <span className="text-green-500 text-sm font-normal">
                                {(
                                  item as CryptoToken
                                ).price_change_percentage_24h.toFixed(2)}
                                %
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center w-full"></div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between w-full sm:w-auto sm:justify-start gap-2 sm:gap-4 flex-wrap">
          <div className=" flex items-center gap-2">
            {/* <a
              href="https://www.instagram.com/huntonraptor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-[#ffc000] transition-colors"
              aria-label="Follow us on Instagram"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="transition-colors"
              >
                <path
                  d="M11.0001 4.99984V5.0065M2.66675 5.33317C2.66675 4.62593 2.9477 3.94765 3.4478 3.44755C3.94789 2.94746 4.62617 2.6665 5.33341 2.6665H10.6667C11.374 2.6665 12.0523 2.94746 12.5524 3.44755C13.0525 3.94765 13.3334 4.62593 13.3334 5.33317V10.6665C13.3334 11.3737 13.0525 12.052 12.5524 12.5521C12.0523 13.0522 11.374 13.3332 10.6667 13.3332H5.33341C4.62617 13.3332 3.94789 13.0522 3.4478 12.5521C2.9477 12.052 2.66675 11.3737 2.66675 10.6665V5.33317ZM6.00008 7.99984C6.00008 8.53027 6.21079 9.03898 6.58587 9.41405C6.96094 9.78912 7.46965 9.99984 8.00008 9.99984C8.53051 9.99984 9.03922 9.78912 9.4143 9.41405C9.78937 9.03898 10.0001 8.53027 10.0001 7.99984C10.0001 7.4694 9.78937 6.9607 9.4143 6.58562C9.03922 6.21055 8.53051 5.99984 8.00008 5.99984C7.46965 5.99984 6.96094 6.21055 6.58587 6.58562C6.21079 6.9607 6.00008 7.4694 6.00008 7.99984Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a> */}

            <a
              href="https://x.com/huntonraptor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-[#ffc000] transition-colors"
              aria-label="Follow us on X (Twitter)"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="transition-colors"
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
              className="text-white hover:text-[#ffc000] transition-colors"
              aria-label="Join us on Telegram"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="transition-colors"
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

          <span className="text-white text-xs sm:text-sm font-normal ml-0 sm:ml-2 whitespace-nowrap">
            © {new Date().getFullYear()} Raptorx. All Rights Reserved
          </span>
        </div>
      </div>
    </footer>
  );
}

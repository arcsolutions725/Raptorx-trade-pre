import type { Metadata } from "next";
import Script from "next/script";
import WalletProvider from "@/providers/WalletProvider";
import TradingProvider from "@/providers/TradingProvder";

export const metadata: Metadata = {
  metadataBase:
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL as string)
      : new URL("https://raptorx.trade"),
  title: "RexMarkets - AI-Powered Prediction Markets Analysis",
  description:
    "Explore prediction markets with AI-powered insights. Real-time market analysis, trading signals, and comprehensive reports for Kalshi, Polymarket, and other prediction market platforms. Make informed trading decisions with RaptorX AI intelligence.",
  keywords: [
    // Prediction Markets Core
    "prediction markets",
    "prediction market trading",
    "prediction market analysis",
    "prediction market platform",
    "event prediction markets",
    "binary options markets",
    "yes/no markets",

    // Platform Specific
    "Kalshi",
    "Kalshi markets",
    "Kalshi trading",
    "Kalshi analysis",
    "Polymarket",
    "Polymarket trading",
    "Polymarket analysis",
    "Augur",
    "Manifold Markets",
    "PredictIt",

    // Market Analysis
    "market probability",
    "market odds",
    "market sentiment",
    "event probability",
    "market forecasting",
    "prediction analytics",
    "market intelligence",
    "trading signals",

    // AI & Technology
    "AI prediction markets",
    "AI market analysis",
    "AI trading signals",
    "machine learning predictions",
    "AI-powered trading",
    "automated market analysis",

    // Trading & Investment
    "prediction market trading",
    "market trading strategies",
    "event trading",
    "binary options",
    "market speculation",
    "information markets",
    "futures markets",

    // Categories
    "politics prediction markets",
    "sports prediction markets",
    "crypto prediction markets",
    "economics prediction markets",
    "election prediction markets",
    "weather prediction markets",

    // Features
    "real-time market data",
    "market volume analysis",
    "market liquidity",
    "market trends",
    "market reports",
    "AI-generated reports",

    // Brand
    "RexMarkets",
    "RaptorX prediction markets",
    "RaptorXchange prediction markets",
  ],
  alternates: {
    canonical: "/rexmarkets",
  },
  openGraph: {
    type: "website",
    url: "/rexmarkets",
    title: "RexMarkets - AI-Powered Prediction Markets Analysis",
    siteName: "RaptorXchange",
    description:
      "Explore prediction markets with AI-powered insights. Real-time market analysis, trading signals, and comprehensive reports for Kalshi, Polymarket, and other prediction market platforms.",
    locale: "en_US",
    images: [
      {
        url: "/images/banner.png",
        width: 1200,
        height: 630,
        alt: "RexMarkets - AI-Powered Prediction Markets Analysis Platform",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RexMarkets - AI-Powered Prediction Markets Analysis",
    description:
      "Explore prediction markets with AI-powered insights. Real-time market analysis, trading signals, and comprehensive reports for Kalshi, Polymarket, and other prediction market platforms.",
    images: ["/images/banner.png"],
    creator: "@huntonraptor",
    site: "@huntonraptor",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  other: {
    "og:type": "website",
    "article:section": "Prediction Markets",
  },
};

export default function RexMarketsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const baseUrl =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL
      ? process.env.NEXT_PUBLIC_SITE_URL
      : "https://raptorx.trade";

  return (
    <>
      <Script
        id="ld-json-rexmarkets-page"
        type="application/ld+json"
        strategy="afterInteractive"
      >
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "RexMarkets - Intelligence for Prediction Markets",
          description:
            "Explore prediction markets with AI-powered insights. Real-time market analysis, trading signals, and comprehensive reports for Kalshi, Polymarket, and other prediction market platforms.",
          url: `${baseUrl}/rexmarkets`,
          inLanguage: "en-US",
          isPartOf: {
            "@type": "WebSite",
            name: "RaptorXchange",
            url: baseUrl,
          },
          about: {
            "@type": "Thing",
            name: "Prediction Markets",
            description: "Intelligence for Prediction Markets",
          },
          mainEntity: {
            "@type": "SoftwareApplication",
            name: "RexMarkets",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web Browser",
            description: "Intelligence for Prediction Markets",
            featureList: [
              "AI-powered market analysis",
              "Real-time prediction market data",
              "Market trading signals",
              "AI-generated market reports",
              "Kalshi market integration",
              "Polymarket analysis",
              "Market probability analysis",
              "Event prediction insights",
            ],
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
          },
        })}
      </Script>
      <WalletProvider>
        <TradingProvider>{children}</TradingProvider>
      </WalletProvider>
    </>
  );
}

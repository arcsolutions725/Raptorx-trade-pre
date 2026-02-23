// src/app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PrivyProviderWrapper } from "@/components/providers/PrivyProvider";
import { PhantomConnectProvider } from "@/components/providers/PhantomConnectProvider";
import Providers from "@/components/providers/QueryProvider";
import { TopbarProvider } from "@/contexts/TopbarContext";
import { DataSourceProvider } from "@/contexts/DataSourceContext";

import { NotificationToaster } from "@/components/ui/notification";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase:
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL as string)
      : new URL("https://raptorx.trade"),
  applicationName: "RaptorXchange",
  title: {
    default: "RaptorXchange - The Intelligence Engine for Traders",
    template: "%s | RaptorXchange",
  },
  description:
    "We are the AI Bloomberg Terminal for Crypto & Prediction markets. Hunt intelligently, hunt with Raptor.",
  keywords: [
    // Brand & Core
    "RaptorX",
    "RaptorXchange",
    "Raptor",
    "raptorx.trade",

    // Primary Keywords
    "AI crypto trading",
    "AI trading platform",
    "crypto Bloomberg terminal",
    "AI trading analytics",
    "crypto trading intelligence",
    "AI token analysis",
    "crypto market analysis",
    "AI trading reports",
    "crypto trading platform",
    "AI-powered trading",

    // Solana Keywords
    "Solana trading",
    "Solana token analysis",
    "Solana DeFi",
    "Solana crypto trading",
    "Solana token screener",
    "Solana market analytics",
    "Solana trading platform",
    "best Solana trading tool",
    "Solana AI trading",

    // BSC/BNB Keywords
    "BSC trading",
    "Binance Smart Chain trading",
    "BNB trading",
    "BSC token analysis",
    "BSC DeFi trading",
    "Binance trading platform",

    // Trading Features
    "crypto token screener",
    "token analytics platform",
    "crypto technical analysis",
    "trading signal generator",
    "crypto market screener",
    "real-time token analysis",
    "crypto price analysis",
    "token price prediction",
    "crypto trading signals",

    // DeFi & Swap
    "DeFi trading",
    "DeFi analytics",
    "crypto swap",
    "token swap",
    "DEX aggregator",
    "cross-chain swap",
    "DeFi token analysis",

    // Technical Terms
    "crypto trading bot",
    "automated trading",
    "trading algorithm",
    "market intelligence",
    "crypto research platform",
    "token due diligence",
    "crypto fundamentals analysis",

    // Competitive Keywords
    "best crypto trading tool",
    "top crypto analytics platform",
    "crypto trading software",
    "professional crypto trading",
    "institutional crypto trading",

    // Prediction Markets
    "prediction markets",
    "crypto prediction",
    "market prediction",

    // General
    "AI",
    "Trading",
    "crypto",
    "trade",
    "cryptocurrency",
    "blockchain",
    "trading analytics",
    "token analytics",
  ],
  authors: [{ name: "RaptorX" }],
  creator: "RaptorX",
  publisher: "RaptorX",
  category: "Finance",
  classification: "Cryptocurrency Trading Platform",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "RaptorX - The Intelligent Pro Terminal for Prediction Markets & Crypto",
    siteName: "RaptorXchange",
    description:
      "We are the AI Bloomberg Terminal for Crypto & Prediction markets. Hunt intelligently, hunt with Raptor.",
    locale: "en_US",
    images: [
      {
        url: "/images/x_banner.png",
        width: 1200,
        height: 630,
        alt: "RaptorXchange - AI Crypto Trading Platform for Solana and BSC",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RaptorX - The Intelligent Pro Terminal for Prediction Markets & Crypto",
    description:
      "We are the AI Bloomberg Terminal for Crypto & Prediction markets. Hunt intelligently, hunt with Raptor.",
    images: ["/images/x_banner.png"],
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
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "format-detection": "telephone=no",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Phantom Portal Meta Tags */}
        <Script
          id="phantom-portal-config"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof document !== 'undefined') {
                const metaAppId = document.createElement('meta');
                metaAppId.name = 'phantom-app-id';
                metaAppId.content = '${process.env.NEXT_PUBLIC_PHANTOM_APP_ID || ""}';
                document.head.appendChild(metaAppId);
                
                const metaAppName = document.createElement('meta');
                metaAppName.name = 'phantom-app-name';
                metaAppName.content = 'RaptorXchange';
                document.head.appendChild(metaAppName);
                
                const metaAppDesc = document.createElement('meta');
                metaAppDesc.name = 'phantom-app-description';
                metaAppDesc.content = 'AI-powered Bloomberg Terminal for cryptocurrency trading. Real-time token analysis, AI trading reports, and technical indicators for Solana and Binance Smart Chain.';
                document.head.appendChild(metaAppDesc);
              }
            `,
          }}
        />
        <Script
          id="ld-json-website"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "RaptorXchange",
            alternateName: "RaptorX",
            url:
              (typeof window === "undefined"
                ? (typeof process !== "undefined" &&
                    process.env.NEXT_PUBLIC_SITE_URL) ||
                  "https://raptorx.trade"
                : window.location.origin) + "/",
            description:
              "AI-powered Bloomberg Terminal for cryptocurrency trading. Real-time token analysis, AI trading reports, and technical indicators for Solana and Binance Smart Chain.",
            inLanguage: "en-US",
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: "{+base}/?q={search_term_string}",
              },
              "query-input": "required name=search_term_string",
            },
          })}
        </Script>
        <Script
          id="ld-json-organization"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "RaptorX",
            legalName: "RaptorX",
            url:
              (typeof window === "undefined"
                ? (typeof process !== "undefined" &&
                    process.env.NEXT_PUBLIC_SITE_URL) ||
                  "https://raptorx.trade"
                : window.location.origin) + "/",
            logo: "/images/logo.png",
            description:
              "RaptorX provides AI-powered cryptocurrency trading intelligence and analytics for Solana and Binance Smart Chain.",
            sameAs: [
              "https://x.com/huntonraptor",
              "https://twitter.com/huntonraptor",
            ],
            contactPoint: {
              "@type": "ContactPoint",
              contactType: "Customer Support",
              email: "support@raptorx.trade",
            },
          })}
        </Script>
        <Script
          id="ld-json-software"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "RaptorXchange",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web Browser",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.8",
              ratingCount: "100",
            },
            description:
              "AI-powered cryptocurrency trading intelligence platform with real-time token analysis, AI trading reports, technical indicators, and market insights for Solana and Binance Smart Chain.",
            featureList: [
              "AI-powered token analysis",
              "Real-time market data",
              "Technical indicators",
              "Trading reports generation",
              "Solana token screening",
              "BSC token analysis",
              "Cross-chain swaps",
              "Market intelligence",
            ],
            screenshot: "/images/x_banner.png",
            url:
              (typeof window === "undefined"
                ? (typeof process !== "undefined" &&
                    process.env.NEXT_PUBLIC_SITE_URL) ||
                  "https://raptorx.trade"
                : window.location.origin) + "/",
          })}
        </Script>
        <Script
          id="ld-json-service"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FinancialProduct",
            name: "RaptorXchange Trading Platform",
            description:
              "AI-powered cryptocurrency trading intelligence and analytics platform for Solana and Binance Smart Chain tokens.",
            provider: {
              "@type": "Organization",
              name: "RaptorX",
            },
            category: "Cryptocurrency Trading",
            areaServed: "Worldwide",
            serviceType: [
              "Token Analysis",
              "Trading Reports",
              "Market Analytics",
              "Technical Analysis",
              "Token Screening",
            ],
          })}
        </Script>
        <PrivyProviderWrapper>
          <PhantomConnectProvider
            appId={process.env.NEXT_PUBLIC_PHANTOM_APP_ID}
          >
            <TopbarProvider>
              <DataSourceProvider>
                <Providers>
                  {children}
                  <SpeedInsights />
                  <Analytics />
                </Providers>
                <NotificationToaster />
                {/* <Footer /> */}
              </DataSourceProvider>
            </TopbarProvider>
          </PhantomConnectProvider>
        </PrivyProviderWrapper>
      </body>
    </html>
  );
}

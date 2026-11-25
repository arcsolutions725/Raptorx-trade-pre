import type { Metadata, Viewport } from "next";
import LandingPage from "@/components/landing/LandingPage";

// Same pattern as the root layout: NEXT_PUBLIC_SITE_URL, falling back to production.
const SITE_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL
    ? (process.env.NEXT_PUBLIC_SITE_URL as string).replace(/\/$/, "")
    : "https://raptorx.trade";

const DESCRIPTION =
  "RaptorX is the AI for Internet Markets: real-time research reports on crypto and prediction markets from Claw AI 5.0, then trade in one workflow.";
const SHARE_TITLE = "RaptorX · The AI for Internet Markets";
const OG_IMAGE = `${SITE_URL}/landing/og-image.jpg`;
const OG_IMAGE_ALT = "RaptorX: a raptor eye radar locking onto a Golden Report and a Pump Report";

export const metadata: Metadata = {
  // absolute: skip the layout's "%s | RaptorXchange" template, as in the prototype
  title: { absolute: SHARE_TITLE },
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: "website",
    siteName: "RaptorX",
    locale: "en_US",
    url: `${SITE_URL}/`,
    title: SHARE_TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, type: "image/jpeg", width: 1200, height: 630, alt: OG_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, alt: OG_IMAGE_ALT }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070707",
  colorScheme: "dark",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "RaptorX",
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/landing/raptorx-logo.png` },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "RaptorX",
      url: `${SITE_URL}/`,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "RaptorX",
      url: `${SITE_URL}/`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript",
      description: DESCRIPTION,
      image: OG_IMAGE,
      publisher: { "@id": `${SITE_URL}/#organization` },
      featureList: [
        "AI crypto screener (RexScreener)",
        "AI token reports: Golden, Pump, Full Report and What's New",
        "Claw AI 5.0 research assistant",
        "Prediction market odds and trading (Rex Predictions)",
        "Built-in token exchange",
        "Daily missions, tiers and leaderboard",
      ],
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <LandingPage />
    </>
  );
}

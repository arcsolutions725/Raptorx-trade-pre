import type { Metadata } from "next";
import { headers } from "next/headers";
import React from "react";

type Props = {
  params: Promise<{ event: string }>;
};

async function getKalshiMarketDetails(eventTicker: string) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://raptorx.trade";
    const url = `${baseUrl}/api/kalshi/market-details?event_ticker=${encodeURIComponent(
      eventTicker,
    )}`;
    const res = await fetch(url, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch Kalshi market details for metadata:", error);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const eventTicker = resolvedParams?.event;

  if (!eventTicker) {
    return {
      title: "Kalshi Event - RaptorX",
      description: "View prediction market details on RaptorX",
    };
  }

  const headersList = await headers();
  const host = headersList.get("host") || "";
  const protocol = headersList.get("x-forwarded-proto") || "https";

  const marketData = await getKalshiMarketDetails(eventTicker);

  if (!marketData) {
    return {
      title: "Kalshi Event - RaptorX",
      description: "View prediction market details on RaptorX",
    };
  }

  const title = marketData.title || "Kalshi Event";
  const description =
    marketData.subtitle ||
    `View ${title} prediction market on RaptorX. Real-time prices, volume, and AI-powered insights.`;
  const markets = marketData.markets || [];

  let siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl && host) {
    siteUrl = `${protocol}://${host}`;
  }
  if (!siteUrl) {
    siteUrl = "https://raptorx.trade";
  }

  const pageUrl = `${siteUrl}/rexmarkets/kalshi/${eventTicker}`;
  const ogImageUrl = `${siteUrl}/api/og?event_ticker=${encodeURIComponent(eventTicker)}`;

  return {
    title: `${title} - RaptorX`,
    description,
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `${title}`,
      description,
      siteName: "RaptorX",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
        ...(marketData.symbol_image_url
          ? [
              {
                url: marketData.symbol_image_url,
                width: 1200,
                height: 630,
                alt: title,
              },
            ]
          : []),
      ],
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title}`,
      description,
      images: [ogImageUrl],
      creator: "@huntonraptor",
      site: "@huntonraptor",
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}

export default function KalshiEventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

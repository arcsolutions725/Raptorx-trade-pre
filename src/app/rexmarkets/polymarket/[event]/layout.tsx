import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

type Props = {
  params: Promise<{ event: string }>;
};

async function getMarketDetails(slug: string, requestUrl?: string) {
  try {
    // Try to determine base URL from request if available
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://raptorx.trade";

    const url = `${baseUrl}/api/polymarket/market-details?slug=${encodeURIComponent(
      slug
    )}`;

    const res = await fetch(url, {
      next: { revalidate: 60 }, // Revalidate every 60 seconds
    });

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to fetch market details for metadata:", error);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const eventSlug = resolvedParams?.event;

  if (!eventSlug) {
    return {
      title: "Polymarket Event - RaptorX",
      description: "View prediction market details on RaptorX",
    };
  }

  // Get current host dynamically
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const protocol = headersList.get("x-forwarded-proto") || "https";
  const requestUrl = host ? `${protocol}://${host}` : undefined;

  const marketData = await getMarketDetails(eventSlug, requestUrl);

  if (!marketData) {
    return {
      title: "Polymarket Event - RaptorX",
      description: "View prediction market details on RaptorX",
    };
  }

  const title = marketData.title || "Polymarket Event";
  const description =
    marketData.subtitle ||
    `View ${title} prediction market on RaptorX. Real-time prices, volume, and AI-powered insights.`;
  const imageUrl = marketData.symbol_image_url || "";
  const markets = marketData.markets || [];

  // Calculate average price
  const avgPrice =
    markets.length > 0
      ? markets.reduce((sum: number, m: any) => sum + (m.yes_price || 0), 0) /
        markets.length
      : 0;
  const pricePercent = Math.round(avgPrice * 100);

  // Use dynamic host if available, otherwise fallback to env or default
  let siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl && host) {
    siteUrl = `${protocol}://${host}`;
  }
  if (!siteUrl) {
    siteUrl = "https://raptorx.trade";
  }

  const pageUrl = `${siteUrl}/rexmarkets/polymarket/${eventSlug}`;
  const ogImageUrl = `${siteUrl}/api/og?slug=${encodeURIComponent(eventSlug)}`;

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
        ...(imageUrl
          ? [
              {
                url: imageUrl,
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

export default function PolymarketEventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { slugToChain } from "@/lib/rexscreenerRoutes";
import {
  fetchScreenerTokenOgData,
  getOgSiteUrl,
} from "@/lib/og/screenerTokenOg";

type Props = {
  params: Promise<{ chainSlug: string; tokenSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chainSlug, tokenSlug } = await params;
  const chain = slugToChain(chainSlug);
  if (!chain || !tokenSlug?.trim()) {
    return {
      title: "RexScreener",
      description: "AI research reports for crypto tokens on RexScreener.",
    };
  }

  const headersList = await headers();
  const siteUrl = getOgSiteUrl(
    headersList.get("x-forwarded-host") || headersList.get("host"),
    headersList.get("x-forwarded-proto") || "https",
  );

  const token = await fetchScreenerTokenOgData(chainSlug, tokenSlug);
  const symbol = (token?.symbol || "TOKEN").replace(/^\$/, "");
  const name = token?.name && token.name !== symbol ? token.name : symbol;
  const chainLabel = token?.chainLabel || chainSlug;
  const title = `${symbol} ($${symbol})`;
  const description = `${name} on ${chainLabel} — AI research report on RexScreener. Hunt with Raptor.`;
  const pageUrl = `${siteUrl}/${chainSlug}/${encodeURIComponent(tokenSlug)}`;
  const ogImageUrl = `${siteUrl}/api/og/token?chain=${encodeURIComponent(chainSlug)}&address=${encodeURIComponent(tokenSlug)}`;

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `${title} · RexScreener`,
      description,
      siteName: "RaptorXchange",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${symbol} on RexScreener`,
        },
      ],
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · RexScreener`,
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

export default async function RexScreenerTokenPage({ params }: Props) {
  const { chainSlug, tokenSlug } = await params;
  if (!slugToChain(chainSlug)) notFound();
  if (!tokenSlug?.trim()) notFound();
  return null;
}

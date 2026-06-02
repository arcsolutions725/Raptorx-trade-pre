import { notFound } from "next/navigation";
import { slugToChain } from "@/lib/rexscreenerRoutes";

export default async function RexScreenerTokenPage({
  params,
}: {
  params: Promise<{ chainSlug: string; tokenSlug: string }>;
}) {
  const { chainSlug, tokenSlug } = await params;
  if (!slugToChain(chainSlug)) notFound();
  if (!tokenSlug?.trim()) notFound();
  return null;
}

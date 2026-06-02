import { notFound } from "next/navigation";
import { slugToChain } from "@/lib/rexscreenerRoutes";

export default async function RexScreenerChainPage({
  params,
}: {
  params: Promise<{ chainSlug: string }>;
}) {
  const { chainSlug } = await params;
  if (!slugToChain(chainSlug)) notFound();
  return null;
}

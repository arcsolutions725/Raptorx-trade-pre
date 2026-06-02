import { redirect } from "next/navigation";

/** Legacy `/rexscreener` URL: default screener is Solana trending. */
export default function RexScreenerLegacyPathPage() {
  redirect("/solana");
}

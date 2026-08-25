import { redirect } from "next/navigation";

/** Legacy `/rexscreener` URL: default screener is Base trending. */
export default function RexScreenerLegacyPathPage() {
  redirect("/base");
}

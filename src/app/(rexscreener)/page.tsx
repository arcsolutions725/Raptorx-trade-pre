import { redirect } from "next/navigation";

/** `/` defaults to RexScreener (see `src/middleware.ts`); this page is a fallback. */
export default function RootHomePage() {
  redirect("/solana");
}

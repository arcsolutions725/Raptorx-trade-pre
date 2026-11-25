import type { ReactNode } from "react";
import {
  RexScreenerShellProvider,
  RexScreenerTableOutlet,
} from "@/app/(rexscreener)/_components/RexScreenerShell";
import "@/styles/pages/screener.css";

export default function RexScreenerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RexScreenerShellProvider>
      <>
        <RexScreenerTableOutlet />
        {children}
      </>
    </RexScreenerShellProvider>
  );
}

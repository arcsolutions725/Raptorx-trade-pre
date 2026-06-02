import type { ReactNode } from "react";
import {
  RexScreenerShellProvider,
  RexScreenerTableOutlet,
} from "@/app/(rexscreener)/_components/RexScreenerShell";

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

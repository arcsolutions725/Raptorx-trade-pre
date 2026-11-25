import type { Viewport } from "next";
import "@/styles/pages/claw.css";

/** Explicit zoom-friendly viewport for Claw (iOS pinch / accessibility). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function ClawV5Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* Full viewport via inset (no vh): avoids iOS 100vh/shell mismatch with body min-height.
     .rx-claw scopes the page styles in styles/pages/claw.css. */
  return (
    <div className="rx-claw rx-app-bg fixed inset-0 overflow-hidden">
      <div className="flex h-full min-h-0 w-full flex-col">{children}</div>
    </div>
  );
}

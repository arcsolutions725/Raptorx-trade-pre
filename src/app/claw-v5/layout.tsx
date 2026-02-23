import type { Metadata } from "next";

export default function ClawV5Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

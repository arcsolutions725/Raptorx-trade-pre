// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PrivyProviderWrapper } from "@/components/providers/PrivyProvider";
import { WalletProviderWrapper } from "@/components/providers/WagamiProvider";
import Providers from "@/components/providers/QueryProvider";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  icons: {
    icon: "/favicon.png",
  },
  title: "RaptorXchange",
  description: "AI Bloomberg Terminal for everything Crypto",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PrivyProviderWrapper>
          <WalletProviderWrapper>
            <Providers>
              {children}
              <SpeedInsights />
              <Analytics />
            </Providers>
          </WalletProviderWrapper>
          <ToastContainer position="top-center" theme="dark" />
        </PrivyProviderWrapper>
      </body>
    </html>
  );
}

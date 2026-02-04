import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RaptorXchange - AI Crypto Trading Platform",
    short_name: "RaptorX",
    description:
      "AI-powered Bloomberg Terminal for cryptocurrency trading. Real-time token analysis, AI trading reports, and technical indicators for Solana and Binance Smart Chain.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/favicon.png",
        sizes: "any",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/images/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["finance", "business", "productivity"],
    lang: "en-US",
    dir: "ltr",
    scope: "/",
    related_applications: [],
    prefer_related_applications: false,
  };
}


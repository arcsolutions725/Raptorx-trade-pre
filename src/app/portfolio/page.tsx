import type { Metadata } from "next";
import PortfolioView from "./_components/PortfolioView";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Live holdings on your RaptorX Base wallet and connected wallets, with profit and loss and a shareable PNL card.",
  robots: { index: false, follow: false },
};

/** design/portfolio.html: total value, value / PNL chart, PNL stats, allocation, holdings, Share PNL. */
export default function PortfolioPage() {
  return <PortfolioView />;
}

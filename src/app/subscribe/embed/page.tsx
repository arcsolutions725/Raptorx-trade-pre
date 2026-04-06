"use client";

import { useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HelioCheckout } from "@heliofi/checkout-react";

const PAYLINK_ID =
  process.env.NEXT_PUBLIC_HELIO_PAYLINK_ID ?? "69a4c1a4a5e4ee39951e0b1a";

/**
 * Minimal page that only renders the Helio checkout widget.
 * Used inside an iframe by PaywallModal so the Helio script runs in the iframe
 * and cannot change the parent window's history (which was triggering the
 * MarketDataTable URL effect and opening sidebars).
 */
function EmbedContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId") ?? undefined;

  const helioConfig = useMemo(
    () => ({
      paylinkId: PAYLINK_ID,
      display: "button" as const,
      theme: { themeMode: "dark" as const },
      primaryColor: "#5C3BFF",
      neutralColor: "#5A6578",
      additionalJSON: userId ? { userId } : undefined,
      customTexts: {
        mainButtonTitle: "Subscribe with MoonPay",
        payButtonTitle: "Pay with crypto or card",
      },
      onSuccess: (event: Record<string, unknown>) => {
        const transaction =
          event?.transaction && typeof event.transaction === "object" && "id" in event.transaction
            ? (event.transaction as { id?: string }).id
            : undefined;
        const transactionId =
          (event?.transactionId as string) ??
          (event?.transaction_id as string) ??
          (event?.id as string) ??
          transaction;
        window.parent.postMessage(
          { type: "helio-paywall-success", transactionId, userId },
          "*"
        );
      },
      onCancel: () => {
        window.parent.postMessage({ type: "helio-paywall-cancel" }, "*");
      },
      onError: () => {},
    }),
    [userId]
  );

  return (
    <div className="h-full min-h-[320px] flex items-center justify-center p-4 bg-transparent">
      <HelioCheckout config={helioConfig} />
    </div>
  );
}

export default function SubscribeEmbedPage() {
  return (
    <Suspense fallback={<div className="min-h-[52px]" />}>
      <EmbedContent />
    </Suspense>
  );
}

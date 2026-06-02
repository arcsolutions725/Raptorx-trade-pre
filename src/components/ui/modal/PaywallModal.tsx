"use client";

import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { HelioCheckout } from "@heliofi/checkout-react";

/** RaptorX Pro pay link; override with NEXT_PUBLIC_HELIO_PAYLINK_ID for testnet or custom link. */
const PAYLINK_ID =
  process.env.NEXT_PUBLIC_HELIO_PAYLINK_ID ?? "69a4c1a4a5e4ee39951e0b1a";

/** Optional: pass so the payment provider can include them in the webhook and we can upgrade the right user. */
export type PaymentMetadata = { userId?: string; privyId?: string };

type PaywallContext = "claw" | "rexmarkets" | "rexscreener";

/** When API returns 402, pass code so we show the right message. */
export type PaywallLimitCode = "FREE_LIMIT_REACHED" | "PAID_LIMIT_REACHED";

type Props = {
  open: boolean;
  onClose: () => void;
  context: PaywallContext;
  /** Optional: from 402 response body. When FREE_LIMIT_REACHED we show "Free Tier has ended for the day". */
  limitCode?: PaywallLimitCode | null;
  /** Optional: pass so checkout includes metadata for webhook and we can upgrade the right user. */
  paymentMetadata?: PaymentMetadata | null;
};

export function PaywallModal({ open, onClose, context, limitCode, paymentMetadata }: Props) {
  const helioConfig = useMemo(
    () => ({
      paylinkId: PAYLINK_ID,
      display: "button" as const,
      theme: { themeMode: "dark" as const },
      primaryColor: "#5C3BFF",
      neutralColor: "#5A6578",
      additionalJSON: {
        ...(paymentMetadata?.userId && { userId: paymentMetadata.userId }),
        ...(paymentMetadata?.privyId && { privyId: paymentMetadata.privyId }),
      },
      customTexts: {
        mainButtonTitle: "Subscribe with MoonPay",
        payButtonTitle: "Pay with crypto or card",
      },
      onSuccess: (event: Record<string, unknown>) => {
        const userId = paymentMetadata?.userId;
        const transaction =
          event?.transaction && typeof event.transaction === "object" && "id" in event.transaction
            ? (event.transaction as { id?: string }).id
            : undefined;
        const transactionId =
          (event?.transactionId as string) ??
          (event?.transaction_id as string) ??
          (event?.id as string) ??
          transaction;
        if (userId) {
          fetch("/api/subscription/confirm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": userId,
            },
            body: JSON.stringify({
              ...(transactionId ? { transactionId: String(transactionId).trim() } : {}),
              trustWebhook: !transactionId,
            }),
          }).catch(() => {});
        }
        onClose();
      },
      onCancel: () => onClose(),
      onError: () => {},
    }),
    [paymentMetadata?.userId, paymentMetadata?.privyId, onClose]
  );

  const title = "Free Tier has ended for the day.";
  const subtitle =
    context === "claw"
      ? "Subscribe to Claw AI 5.0 Pro for maximum usage."
      : context === "rexmarkets"
        ? "Subscribe to Claw AI 5.0 Pro to unlock full Prediction Markets intelligence."
        : "Subscribe to Claw AI 5.0 Pro to unlock full RexScreener reports.";

  const body = (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70">
      <div className="relative max-w-md w-full mx-4 rounded-3xl border border-[#FFC000] bg-[#050505] px-8 py-10 text-center shadow-[0_0_30px_rgba(255,192,0,0.4)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 flex items-center justify-center min-w-11 min-h-11 bg-transparent text-white/70 hover:text-white text-3xl font-light transition-colors"
          aria-label="Close"
        >
          ×
        </button>

        <p className="text-[#FFC000] text-xl font-semibold mb-3">{title}</p>
        <p className="text-white/85 text-sm mb-6 leading-relaxed">{subtitle}</p>

        <div className="min-h-[52px] flex items-center justify-center">
          <HelioCheckout config={helioConfig} />
        </div>
      </div>
    </div>
  );

  if (!open) return null;
  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}

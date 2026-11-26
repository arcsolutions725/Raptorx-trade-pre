"use client";

import { useMemo, useRef, type ReactNode } from "react";
import Image from "next/image";
import { HelioCheckout } from "@heliofi/checkout-react";
import { AcctModal, AcctModalHead } from "@/components/ui/modal/accountUi";

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

  const title = "Free tier has ended for the day";
  const subtitle =
    context === "claw"
      ? "Subscribe to Claw AI 5.0 Pro for maximum usage."
      : context === "rexmarkets"
        ? "Subscribe to Claw AI 5.0 Pro to unlock full Prediction Markets intelligence."
        : "Subscribe to Claw AI 5.0 Pro to unlock full RexScreener reports.";

  if (!open) return null;

  return (
    <PaywallDialog title={title} subtitle={subtitle} onClose={onClose}>
      <HelioCheckout config={helioConfig} />
    </PaywallDialog>
  );
}

/** Popup family shell (AcctModal), above other overlays as before. Closes only from its X, as before. */
function PaywallDialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  return (
    <AcctModal labelledBy="paywall-title" variant="plain" modalRef={modalRef} zIndex={999}>
      <AcctModalHead
        id="paywall-title"
        eyebrow="Claw AI 5.0 Pro"
        title={title}
        onClose={onClose}
      />
      <div className="acct-modal__body pw-body">
        <span className="pw-mark" aria-hidden="true">
          <Image src="/images/claw-logo-96.webp" alt="" width={40} height={40} />
        </span>
        <p>{subtitle}</p>
        <div className="pw-checkout">{children}</div>
      </div>
    </AcctModal>
  );
}

"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type PaymentMetadata = { userId?: string; privyId?: string };

type PaywallContext = "claw" | "rexmarkets" | "rexscreener";

export type PaywallLimitCode = "FREE_LIMIT_REACHED" | "PAID_LIMIT_REACHED";

type Props = {
  open: boolean;
  onClose: () => void;
  context: PaywallContext;
  limitCode?: PaywallLimitCode | null;
  paymentMetadata?: PaymentMetadata | null;
};

/**
 * PaywallModal renders the Helio checkout inside an iframe (/subscribe/embed)
 * so the Helio script runs in the iframe and cannot change the parent window's
 * history or focus. That was causing the MarketDataTable URL effect to run and
 * open the right panel + ChatSidebar when the modal opened.
 * When open, we also set the app root (body.firstElementChild) to inert so the
 * rest of the app cannot receive focus or pointer events.
 */
export function PaywallModal({ open, onClose, context, paymentMetadata }: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const userIdRef = useRef(paymentMetadata?.userId);
  userIdRef.current = paymentMetadata?.userId;

  // Make the app root inert so it cannot receive focus or clicks while the paywall is open.
  // The modal is rendered via createPortal as a sibling of the app root, so only the app is inert.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const appRoot = document.body.firstElementChild;
    if (!appRoot) return;
    appRoot.setAttribute("inert", "");
    return () => appRoot.removeAttribute("inert");
  }, [open]);

  // Lock body scroll while modal is open (same as other modals)
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Listen for messages from the embed iframe (success/cancel)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "helio-paywall-success") {
        const userId = userIdRef.current ?? e.data.userId;
        const transactionId = e.data.transactionId;
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
        onCloseRef.current();
      } else if (e.data?.type === "helio-paywall-cancel") {
        onCloseRef.current();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [open]);

  const title = "Free Tier has ended for the day.";
  const subtitle =
    context === "claw"
      ? "Subscribe to Claw AI 5.0 Pro for maximum usage."
      : context === "rexmarkets"
        ? "Subscribe to Claw AI 5.0 Pro to unlock full Prediction Markets intelligence."
        : "Subscribe to Claw AI 5.0 Pro to unlock full RexScreener reports.";

  const embedUrl =
    typeof window === "undefined"
      ? ""
      : `/subscribe/embed${paymentMetadata?.userId ? `?userId=${encodeURIComponent(paymentMetadata.userId)}` : ""}`;

  const body = (
    <div className="fixed inset-0 z-999 flex items-center justify-center p-3 sm:p-4 bg-black/70">
      <div className="relative flex flex-col w-full max-w-2xl max-h-225 rounded-2xl border border-[#FFC000] bg-[#050505] shadow-[0_0_30px_rgba(255,192,0,0.4)] overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex items-center justify-center min-w-11 min-h-11 bg-transparent text-white/70 hover:text-white text-3xl font-light transition-colors"
          aria-label="Close"
        >
          ×
        </button>

        <div className="shrink-0 px-6 sm:px-8 pt-6 pb-3 text-center">
          <p className="text-[#FFC000] text-lg sm:text-xl font-semibold mb-1">{title}</p>
          <p className="text-white/85 text-xs sm:text-sm leading-relaxed">{subtitle}</p>
        </div>

        <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-4 pb-4 overflow-hidden">
          <iframe
            src={embedUrl}
            title="Subscribe with MoonPay"
            className="w-full flex-1 min-h-130 border-0 bg-transparent rounded-lg overflow-auto"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          />
        </div>
      </div>
    </div>
  );

  if (!open) return null;
  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}

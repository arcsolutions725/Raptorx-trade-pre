"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";

/**
 * Success page after completing Claw Pro payment via MoonPay/Helio.
 * Configure this URL in your Helio pay link / dashboard as the "Success URL"
 * so users are redirected here after payment.
 *
 * On load we resolve the current user and call the confirm API to verify the
 * payment and activate CLAW_PRO. We pass any transactionId from the URL so
 * the backend can verify with Helio.
 */
export default function SubscribeSuccessPage() {
  const { authenticated: privyAuthenticated, user: privyUser, ready: privyReady } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } = usePhantomConnect();
  const authenticated = privyAuthenticated || phantomAuthenticated;

  const [status, setStatus] = useState<"loading" | "success" | "error" | "no-user" | "pending">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!privyReady && !phantomAuthenticated) return;
    if (!authenticated) {
      setStatus("no-user");
      return;
    }

    const authId = privyUser?.id || phantomUser?.id;
    if (!authId) {
      setStatus("no-user");
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        // Resolve our internal user id (same pattern as rest of app)
        const userRes = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            privyUser?.id
              ? { privyId: privyUser.id }
              : { phantomId: (phantomUser as { id?: string })!.id }
          ),
        });
        if (!userRes.ok || cancelled) return;
        const userData = await userRes.json();
        const userId = userData?.user?.id;
        if (!userId || cancelled) {
          setStatus("no-user");
          return;
        }

        // Transaction id: URL params (transactionId, transaction_id, id) or from statusToken JWT payload
        const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
        let transactionId =
          params.get("transactionId") ||
          params.get("transaction_id") ||
          params.get("id") ||
          null;
        if (!transactionId) {
          const statusToken = params.get("statusToken") || params.get("status_token");
          if (statusToken) {
            try {
              const payload = JSON.parse(atob(statusToken.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") || ""));
              const id = payload?.transactionId ?? payload?.transaction_id;
              if (typeof id === "string" && id.trim()) transactionId = id.trim();
            } catch {
              // ignore
            }
          }
        }

        const confirmRes = await fetch("/api/subscription/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
          body: JSON.stringify({
            ...(transactionId ? { transactionId } : {}),
            trustWebhook: !transactionId,
          }),
        });
        if (cancelled) return;

        const confirmData = await confirmRes.json().catch(() => ({}));
        if (confirmRes.ok && confirmData?.ok) {
          setStatus(confirmData?.pending ? "pending" : "success");
          if (confirmData?.pending) setErrorMessage(confirmData?.message ?? "");
        } else {
          setStatus("pending");
          setErrorMessage(
            confirmData?.error ||
              "We're processing your payment. Your subscription will activate shortly—please refresh or return to the app."
          );
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [authenticated, privyReady, privyUser?.id, phantomUser, phantomAuthenticated]);

  if (status === "no-user") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
        <div className="max-w-md w-full text-center rounded-2xl border border-[#FFC000]/50 bg-[#0a0a0a] p-8 shadow-[0_0_40px_rgba(255,192,0,0.15)]">
          <h1 className="text-[#FFC000] text-xl font-semibold mb-3">Sign in to continue</h1>
          <p className="text-white/85 text-sm mb-8 leading-relaxed">
            Please sign in with the same account you used to pay. Then refresh this page so we can
            activate your Claw Pro subscription.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#5C3BFF] hover:bg-[#7A5CFF] text-white font-semibold text-sm transition"
          >
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
        <div className="max-w-md w-full text-center rounded-2xl border border-[#FFC000]/50 bg-[#0a0a0a] p-8 shadow-[0_0_40px_rgba(255,192,0,0.15)]">
          <div className="mb-6 text-4xl animate-pulse">⋯</div>
          <h1 className="text-[#FFC000] text-xl font-semibold mb-3">Activating your subscription</h1>
          <p className="text-white/85 text-sm">Please wait a moment.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
        <div className="max-w-md w-full text-center rounded-2xl border border-red-500/50 bg-[#0a0a0a] p-8 shadow-[0_0_40px_rgba(255,80,80,0.15)]">
          <div className="mb-6 text-5xl text-red-400">✕</div>
          <h1 className="text-red-400 text-xl font-semibold mb-3">Something went wrong</h1>
          <p className="text-white/85 text-sm mb-8 leading-relaxed">{errorMessage}</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#5C3BFF] hover:bg-[#7A5CFF] text-white font-semibold text-sm transition"
          >
            Go to home
          </Link>
          <p className="mt-4 text-xs text-white/50">
            If you were charged, contact support with your payment details and we’ll activate your
            subscription.
          </p>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
        <div className="max-w-md w-full text-center rounded-2xl border border-[#FFC000]/50 bg-[#0a0a0a] p-8 shadow-[0_0_40px_rgba(255,192,0,0.15)]">
          <div className="mb-6 text-5xl text-[#FFC000]">⋯</div>
          <h1 className="text-[#FFC000] text-xl font-semibold mb-3">Payment received</h1>
          <p className="text-white/85 text-sm mb-8 leading-relaxed">
            {errorMessage ||
              "We're processing your payment. Your subscription will activate shortly—please refresh or return to the app."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#5C3BFF] hover:bg-[#7A5CFF] text-white font-semibold text-sm transition mr-3"
          >
            Refresh
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition"
          >
            Go to home
          </Link>
          <p className="mt-4 text-xs text-white/50">
            If your subscription doesn't activate within a few minutes, contact support with your
            payment details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
      <div className="max-w-md w-full text-center rounded-2xl border border-[#FFC000]/50 bg-[#0a0a0a] p-8 shadow-[0_0_40px_rgba(255,192,0,0.15)]">
        <div className="mb-6 text-5xl">✓</div>
        <h1 className="text-[#FFC000] text-xl font-semibold mb-3">Payment successful</h1>
        <p className="text-white/85 text-sm mb-8 leading-relaxed">
          Your Claw AI 5.0 Pro subscription is now active. You have full access to Claw AI,
          RexScreener reports, and Prediction Markets reports for this period.
        </p>
        <Link
          href="/claw-v5"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#5C3BFF] hover:bg-[#7A5CFF] text-white font-semibold text-sm transition"
        >
          Continue to Claw AI
        </Link>
        <p className="mt-4 text-xs text-white/50">
          If you don’t see your upgrade yet, refresh the page or log in again.
        </p>
      </div>
    </div>
  );
}

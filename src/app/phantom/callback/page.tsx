"use client";

/**
 * Where Phantom drops the user after they approve (or reject) in the app.
 *
 * This page is the entire second half of the mobile flow. The deeplink destroyed
 * the previous page, so everything we need is rebuilt from `localStorage` plus the
 * query params Phantom appended.
 *
 * For a signature it does the work Li.Fi would normally do itself — broadcast the
 * signed transaction and wait for confirmation — and then writes the resulting
 * txHash into Li.Fi's persisted route BEFORE bouncing back. That ordering is
 * load-bearing: the widget auto-resumes the moment it mounts, and if it found the
 * step still unsigned it would re-quote and ask us to sign a second, different
 * swap. See `lifiRoutes.ts`.
 */
import { useEffect, useRef, useState } from "react";
import {
  broadcastAndConfirm,
  deserializeSignedTx,
  solscanTxLink,
} from "@/lib/phantom-deeplink/broadcast";
import { broadcastPhantomTakeover } from "@/lib/phantom-deeplink/channel";
import { decryptPayload, deriveSharedSecret } from "@/lib/phantom-deeplink/crypto";
import {
  discardPendingSignAttempt,
  markProcessDone,
  markRouteFailed,
  type PendingSignTarget,
} from "@/lib/phantom-deeplink/lifiRoutes";
import {
  consumePendingAction,
  getDappSecretKey,
  getSharedSecret,
  storeSession,
  type PendingAction,
} from "@/lib/phantom-deeplink/session";
import { preferLifiPhantomWallet } from "@/lib/phantomReturnUrl";

type Phase =
  | { state: "working"; message: string }
  | { state: "error"; message: string; detail?: string; txLink?: string };

/** Phantom appends these, unencrypted, when the user rejects or something breaks. */
function readPhantomError(params: URLSearchParams): string | null {
  const code = params.get("errorCode");
  if (!code) return null;
  const message = params.get("errorMessage") ?? "Unknown error";
  return code === "4001" ? "You rejected the request in Phantom." : message;
}

function goBack(returnTo: string): void {
  const target = returnTo || "/";

  // Chrome opened this tab from Phantom's intent, leaving the user's original tab
  // behind as a stale duplicate. This tab holds the completed session and the
  // patched route, so it's the one that continues — tell the old one to close.
  broadcastPhantomTakeover();

  // Full document load, not a client-side nav: it guarantees Li.Fi's persisted
  // route store hydrates from the localStorage we just patched.
  window.location.replace(target);
}

async function handleConnect(
  params: URLSearchParams,
  action: Extract<PendingAction, { kind: "connect" }>,
): Promise<Phase | null> {
  const phantomPublicKey = params.get("phantom_encryption_public_key");
  const nonce = params.get("nonce");
  const data = params.get("data");
  const secretKey = getDappSecretKey();

  if (!phantomPublicKey || !nonce || !data || !secretKey) {
    return { state: "error", message: "Phantom's response was incomplete." };
  }

  const sharedSecret = deriveSharedSecret(phantomPublicKey, secretKey);
  const { public_key, session } = decryptPayload<{
    public_key: string;
    session: string;
  }>(data, nonce, sharedSecret);

  storeSession({ sharedSecret, session, publicKey: public_key });
  // Make the widget auto-select Phantom when it remounts, so the user lands on a
  // connected wallet showing their balance rather than a wallet picker.
  preferLifiPhantomWallet();

  goBack(action.returnTo);
  return null;
}

async function handleSignature(
  params: URLSearchParams,
  action: Extract<PendingAction, { kind: "signTransactions" }>,
  setPhase: (p: Phase) => void,
): Promise<Phase | null> {
  const target: PendingSignTarget = {
    routeId: action.routeId,
    stepId: action.stepId,
    processType: action.processType,
  };

  const nonce = params.get("nonce");
  const data = params.get("data");
  const sharedSecret = getSharedSecret();

  if (!nonce || !data || !sharedSecret) {
    // Nothing was signed, so nothing can land. Safe to let Li.Fi re-quote.
    discardPendingSignAttempt(target);
    return { state: "error", message: "Phantom's response was incomplete." };
  }

  const decrypted = decryptPayload<{
    transaction?: string;
    transactions?: string[];
  }>(data, nonce, sharedSecret);

  const signedB58 = decrypted.transactions ??
    (decrypted.transaction ? [decrypted.transaction] : []);
  if (!signedB58.length) {
    discardPendingSignAttempt(target);
    return { state: "error", message: "Phantom returned no signed transaction." };
  }

  setPhase({ state: "working", message: "Submitting your swap…" });

  // Li.Fi's Solana steps are a single transaction; if that ever changes, the last
  // one is the swap itself and the earlier ones must land first.
  let lastSignature = "";
  for (const b58 of signedB58) {
    const tx = deserializeSignedTx(b58);
    const result = await broadcastAndConfirm(tx);
    lastSignature = result.signature;

    if (result.status === "expired") {
      // Provably never landed — the blockhash is gone. Clean restart is safe.
      discardPendingSignAttempt(target);
      return {
        state: "error",
        message: "The swap expired before it could be submitted.",
        detail: "Approving took too long. Nothing was sent — you can try again.",
      };
    }

    if (result.status === "failed") {
      discardPendingSignAttempt(target);
      return {
        state: "error",
        message: "The swap was rejected on-chain.",
        detail: result.error,
        txLink: solscanTxLink(result.signature),
      };
    }

    if (result.status === "unknown") {
      // The one case we must not retry: it may yet land. Freeze the route so the
      // widget cannot auto-resume and sign a second swap, and let the user check.
      markRouteFailed(target, result.error, result.signature);
      return {
        state: "error",
        message: "We couldn't confirm your swap in time.",
        detail:
          "It may still complete. Check the transaction before trying again — " +
          "retrying now could swap twice.",
        txLink: solscanTxLink(result.signature),
      };
    }
  }

  // Confirmed. Credit the txHash to the Li.Fi step so the resumed executor skips
  // signing and goes straight to polling the destination.
  const credited = markProcessDone(
    target,
    lastSignature,
    solscanTxLink(lastSignature),
  );
  if (!credited) {
    return {
      state: "error",
      message: "Your swap went through, but we lost track of it.",
      detail: "The transaction confirmed on-chain — check the explorer.",
      txLink: solscanTxLink(lastSignature),
    };
  }

  setPhase({ state: "working", message: "Swap confirmed — finishing up…" });
  goBack(action.returnTo);
  return null;
}

export default function PhantomCallbackPage() {
  const [phase, setPhase] = useState<Phase>({
    state: "working",
    message: "Returning from Phantom…",
  });
  const ran = useRef(false);

  useEffect(() => {
    // `consumePendingAction` is destructive — React StrictMode would eat it twice.
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const action = consumePendingAction();

      if (!action) {
        window.location.replace("/");
        return;
      }

      const phantomError = readPhantomError(params);
      if (phantomError) {
        // Phantom errored before signing anything, so nothing can be in flight.
        if (action.kind === "signTransactions") {
          discardPendingSignAttempt({
            routeId: action.routeId,
            stepId: action.stepId,
            processType: action.processType,
          });
        }
        setPhase({ state: "error", message: phantomError });
        return;
      }

      try {
        const result =
          action.kind === "connect"
            ? await handleConnect(params, action)
            : await handleSignature(params, action, setPhase);
        if (result) setPhase(result);
      } catch (error) {
        setPhase({
          state: "error",
          message: "Something went wrong handling Phantom's response.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center text-white">
      {phase.state === "working" ? (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#ffc000] border-t-transparent" />
          <p className="text-sm text-white/80">{phase.message}</p>
          <p className="text-xs text-white/40">Keep this page open.</p>
        </>
      ) : (
        <>
          <p className="text-base font-semibold">{phase.message}</p>
          {phase.detail && (
            <p className="max-w-sm text-sm text-white/60">{phase.detail}</p>
          )}
          {phase.txLink && (
            <a
              href={phase.txLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#ffc000] underline"
            >
              View transaction
            </a>
          )}
          <button
            onClick={() => window.location.replace("/")}
            className="mt-2 rounded-lg bg-[#ffc000] px-5 py-2 text-sm font-semibold text-black"
          >
            Back to RaptorX
          </button>
        </>
      )}
    </main>
  );
}

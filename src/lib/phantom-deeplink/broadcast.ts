/**
 * Broadcast a transaction Phantom signed for us, and decide — unambiguously —
 * whether it landed.
 *
 * Li.Fi normally broadcasts Solana transactions itself, but the deeplink unloads
 * our page mid-signature, so the SDK never gets the signed bytes. We take over
 * that job here, in `/phantom/callback`.
 *
 * The safety argument that makes the whole deeplink flow non-duplicating:
 *
 *   - A signed transaction's id IS its first signature, and we know it from the
 *     bytes BEFORE broadcasting. So we can always ask "did this land?".
 *   - Re-sending identical signed bytes is idempotent — same signature, so the
 *     cluster dedupes. Retrying is free.
 *   - A transaction whose blockhash has expired can NEVER be confirmed. So once
 *     the blockhash is gone and the signature has no status, we know for certain
 *     nothing happened, and re-quoting is safe.
 *
 * Those three give us a decidable outcome for every path: `confirmed` (credit the
 * txHash to Li.Fi) or `expired` (provably nothing happened — safe to restart).
 * We never guess.
 */
import {
  Connection,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getHeliusRpcUrl } from "@/lib/rpc";

export type BroadcastResult =
  | { status: "confirmed"; signature: string }
  /** Blockhash expired with no on-chain trace: the swap provably did not happen. */
  | { status: "expired"; signature: string }
  /** The transaction landed but the runtime rejected it — nothing was swapped. */
  | { status: "failed"; signature: string; error: string }
  /**
   * We could not reach a verdict. The transaction MAY still land. This is the one
   * path where retrying is unsafe: the caller must not let anything re-sign.
   */
  | { status: "unknown"; signature: string; error: string };

type AnyTx = Transaction | VersionedTransaction;

/** Phantom returns signed transactions base58-encoded. Versioned or legacy. */
export function deserializeSignedTx(b58: string): AnyTx {
  const bytes = bs58.decode(b58);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

/** The transaction id — known before broadcast. Empty if Phantom returned it unsigned. */
export function txSignature(tx: AnyTx): string {
  const sig =
    tx instanceof VersionedTransaction ? tx.signatures[0] : tx.signatures[0]?.signature;
  if (!sig || sig.every((b) => b === 0)) {
    throw new Error("Phantom returned an unsigned transaction");
  }
  return bs58.encode(sig);
}

function recentBlockhash(tx: AnyTx): string | null {
  return tx instanceof VersionedTransaction
    ? tx.message.recentBlockhash
    : (tx.recentBlockhash ?? null);
}

function rawBytes(tx: AnyTx): Uint8Array {
  return tx instanceof VersionedTransaction
    ? tx.serialize()
    : new Uint8Array(tx.serialize());
}

const POLL_INTERVAL_MS = 2_000;
const RESEND_EVERY_MS = 4_000;
/** Hard ceiling: a Solana blockhash outlives ~150 slots (~60-90s) at most. */
const MAX_WAIT_MS = 120_000;

/**
 * Send the signed transaction and wait for a verdict.
 *
 * Re-sends periodically (the cluster dedupes by signature) and stops the moment
 * the blockhash expires, which is the point at which "not confirmed" becomes a
 * permanent, safe answer rather than a maybe.
 */
export async function broadcastAndConfirm(tx: AnyTx): Promise<BroadcastResult> {
  const connection = new Connection(getHeliusRpcUrl(), "confirmed");
  const signature = txSignature(tx);
  const blockhash = recentBlockhash(tx);
  const raw = rawBytes(tx);

  const started = Date.now();
  let lastSend = 0;

  while (Date.now() - started < MAX_WAIT_MS) {
    if (Date.now() - lastSend > RESEND_EVERY_MS) {
      lastSend = Date.now();
      try {
        await connection.sendRawTransaction(raw, {
          skipPreflight: true,
          maxRetries: 0,
        });
      } catch {
        // Already-processed / transient RPC noise. The status poll below is the
        // source of truth, not the send call.
      }
    }

    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) {
        return { status: "failed", signature, error: JSON.stringify(status.err) };
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return { status: "confirmed", signature };
      }
    }

    // No trace yet — is it still even possible for this to land?
    if (blockhash) {
      const stillValid = await connection
        .isBlockhashValid(blockhash, { commitment: "confirmed" })
        .then((r) => r.value)
        .catch(() => true); // On RPC error, assume valid: never call "expired" on a guess.
      if (!stillValid) {
        // One last look — it could have confirmed in the window we were asking.
        const final = (await connection.getSignatureStatuses([signature])).value[0];
        if (final && !final.err) return { status: "confirmed", signature };
        if (final?.err) {
          return { status: "failed", signature, error: JSON.stringify(final.err) };
        }
        return { status: "expired", signature };
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Timed out without the blockhash provably expiring, so we cannot claim it did
  // not land. Undecidable — the caller must NOT re-sign on this path.
  return {
    status: "unknown",
    signature,
    error: "Timed out waiting for confirmation",
  };
}

export const solscanTxLink = (signature: string) =>
  `https://solscan.io/tx/${signature}`;

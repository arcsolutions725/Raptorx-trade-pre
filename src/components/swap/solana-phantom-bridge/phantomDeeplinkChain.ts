/**
 * A `PhantomStandardChain` whose operations are Phantom mobile deeplinks.
 *
 * This is the mobile (no-extension) backing for the Wallet Standard wallet in
 * `phantomStandardWallet.ts`. Desktop keeps using the Phantom Connect SDK chain;
 * mobile swaps in this one, and Li.Fi can't tell the difference — it just sees a
 * Standard wallet that can connect and sign.
 *
 * The catch every method here shares: a deeplink UNLOADS THE PAGE. `connect` and
 * the sign methods therefore never resolve. Control resumes in `/phantom/callback`
 * on a fresh page load, which persists the result and bounces back. Callers must
 * treat these as "hand off and stop", not "await a value".
 */
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { VersionedTransaction as VersionedTx } from "@solana/web3.js";
import {
  clearPhantomSession,
  getPhantomAddress,
  hasPhantomSession,
} from "@/lib/phantom-deeplink/session";
import {
  openPhantomConnect,
  openPhantomSignTransactions,
} from "@/lib/phantom-deeplink/links";
import { findPendingSignTarget } from "@/lib/phantom-deeplink/lifiRoutes";
import type { PhantomStandardChain } from "./phantomStandardWallet";

/** Unsigned serialization — legacy transactions refuse to serialize without it. */
function serializeUnsigned(tx: Transaction | VersionedTransaction): Uint8Array {
  return tx instanceof VersionedTx
    ? tx.serialize()
    : new Uint8Array(tx.serialize({ requireAllSignatures: false }));
}

/**
 * Li.Fi has already flipped the step's process to ACTION_REQUIRED and persisted
 * it by the time it asks us to sign, so we can find out which route this
 * signature belongs to. Without it, the callback would have nowhere to write the
 * txHash and Li.Fi would re-sign on resume — a double-swap.
 */
function requireSignTarget() {
  const target = findPendingSignTarget();
  if (!target) {
    throw new Error(
      "Could not identify the swap awaiting signature — refusing to sign, " +
        "because the result could not be matched back to the route.",
    );
  }
  return target;
}

export function createPhantomDeeplinkChain(): PhantomStandardChain {
  return {
    get publicKey() {
      return getPhantomAddress();
    },
    get connected() {
      return hasPhantomSession();
    },

    async connect(options?: { onlyIfTrusted?: boolean }) {
      const existing = getPhantomAddress();
      if (existing) return { publicKey: existing };
      // `onlyIfTrusted` is the silent probe — it must never launch the wallet app.
      if (options?.onlyIfTrusted) {
        throw new Error("No trusted Phantom session");
      }
      return openPhantomConnect();
    },

    async disconnect() {
      clearPhantomSession();
    },

    async signTransaction<T extends Transaction | VersionedTransaction>(
      transaction: T,
    ): Promise<T> {
      return openPhantomSignTransactions(
        [serializeUnsigned(transaction)],
        requireSignTarget(),
      );
    },

    async signAllTransactions<T extends Transaction | VersionedTransaction>(
      transactions: T[],
    ): Promise<T[]> {
      return openPhantomSignTransactions(
        transactions.map(serializeUnsigned),
        requireSignTarget(),
      );
    },

    async signAndSendTransaction(): Promise<{ signature: string }> {
      // Li.Fi's Solana executor never calls this — it signs, then broadcasts
      // itself. Routing it through the deeplink would put a second broadcaster in
      // play and make "did it land?" undecidable, so refuse rather than guess.
      throw new Error(
        "signAndSendTransaction is not supported over Phantom deeplinks — " +
          "sign and broadcast separately.",
      );
    },

    async signMessage(): Promise<{ signature: Uint8Array; publicKey: string }> {
      throw new Error(
        "Message signing is not supported in the Phantom mobile deeplink flow.",
      );
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A Solana **Wallet Standard** wallet backed by the app's Phantom Connect session.
 *
 * This is what makes "Phantom" appear inside Li.Fi's own "Select a wallet" menu
 * on mobile. Li.Fi (via `@solana/wallet-adapter-react`'s `useStandardWalletAdapters`)
 * discovers wallets registered through the Wallet Standard — the exact channel the
 * Phantom browser extension uses on desktop. There is no extension on mobile web,
 * so we register one ourselves whose signing is delegated to Phantom Connect's
 * deep-link `ISolanaChain`.
 *
 * NOTE: the Wallet Standard passes transactions as serialized `Uint8Array`, while
 * `ISolanaChain` works with web3.js transaction objects — so each method
 * deserializes in and reserializes out.
 */
import { registerWallet } from "@wallet-standard/wallet";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  preferLifiPhantomWallet,
  savePhantomReturnContext,
} from "@/lib/phantomReturnUrl";

/** Subset of `@phantom/react-sdk`'s `ISolanaChain` we depend on. */
export interface PhantomStandardChain {
  readonly publicKey: string | null;
  readonly connected: boolean;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: string }>;
  disconnect(): Promise<void>;
  signMessage(
    message: string | Uint8Array,
  ): Promise<{ signature: Uint8Array; publicKey: string }>;
  signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
  ): Promise<T>;
  /**
   * Sign a batch in one shot. Optional: the Phantom Connect (desktop) chain has
   * no such method and is fine signing one at a time, but the mobile deeplink
   * chain MUST have it — each deeplink unloads the page, so a per-transaction
   * loop would only ever get the first one signed.
   */
  signAllTransactions?<T extends Transaction | VersionedTransaction>(
    transactions: T[],
  ): Promise<T[]>;
  signAndSendTransaction(
    transaction: Transaction | VersionedTransaction,
  ): Promise<{ signature: string }>;
}

const CHAIN_MAINNET = "solana:mainnet";
const SOLANA_CHAINS = [CHAIN_MAINNET, "solana:devnet"] as const;
const ACCOUNT_FEATURES = [
  "solana:signTransaction",
  "solana:signAndSendTransaction",
  "solana:signMessage",
] as const;

/** Official Phantom mark (same data-URI the Phantom wallet-adapter ships).
 *  Hand-drawing this SVG produced a malformed ghost — always use the real asset. */
const PHANTOM_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiB2aWV3Qm94PSIwIDAgMTA4IDEwOCIgZmlsbD0ibm9uZSI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9IiNBQjlGRjIiLz4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik00Ni41MjY3IDY5LjkyMjlDNDIuMDA1NCA3Ni44NTA5IDM0LjQyOTIgODUuNjE4MiAyNC4zNDggODUuNjE4MkMxOS41ODI0IDg1LjYxODIgMTUgODMuNjU2MyAxNSA3NS4xMzQyQzE1IDUzLjQzMDUgNDQuNjMyNiAxOS44MzI3IDcyLjEyNjggMTkuODMyN0M4Ny43NjggMTkuODMyNyA5NCAzMC42ODQ2IDk0IDQzLjAwNzlDOTQgNTguODI1OCA4My43MzU1IDc2LjkxMjIgNzMuNTMyMSA3Ni45MTIyQzcwLjI5MzkgNzYuOTEyMiA2OC43MDUzIDc1LjEzNDIgNjguNzA1MyA3Mi4zMTRDNjguNzA1MyA3MS41NzgzIDY4LjgyNzUgNzAuNzgxMiA2OS4wNzE5IDY5LjkyMjlDNjUuNTg5MyA3NS44Njk5IDU4Ljg2ODUgODEuMzg3OCA1Mi41NzU0IDgxLjM4NzhDNDcuOTkzIDgxLjM4NzggNDUuNjcxMyA3OC41MDYzIDQ1LjY3MTMgNzQuNDU5OEM0NS42NzEzIDcyLjk4ODQgNDUuOTc2OCA3MS40NTU2IDQ2LjUyNjcgNjkuOTIyOVpNODMuNjc2MSA0Mi41Nzk0QzgzLjY3NjEgNDYuMTcwNCA4MS41NTc1IDQ3Ljk2NTggNzkuMTg3NSA0Ny45NjU4Qzc2Ljc4MTYgNDcuOTY1OCA3NC42OTg5IDQ2LjE3MDQgNzQuNjk4OSA0Mi41Nzk0Qzc0LjY5ODkgMzguOTg4NSA3Ni43ODE2IDM3LjE5MzEgNzkuMTg3NSAzNy4xOTMxQzgxLjU1NzUgMzcuMTkzMSA4My42NzYxIDM4Ljk4ODUgODMuNjc2MSA0Mi41Nzk0Wk03MC4yMTAzIDQyLjU3OTVDNzAuMjEwMyA0Ni4xNzA0IDY4LjA5MTYgNDcuOTY1OCA2NS43MjE2IDQ3Ljk2NThDNjMuMzE1NyA0Ny45NjU4IDYxLjIzMyA0Ni4xNzA0IDYxLjIzMyA0Mi41Nzk1QzYxLjIzMyAzOC45ODg1IDYzLjMxNTcgMzcuMTkzMSA2NS43MjE2IDM3LjE5MzFDNjguMDkxNiAzNy4xOTMxIDcwLjIxMDMgMzguOTg4NSA3MC4yMTAzIDQyLjU3OTVaIiBmaWxsPSIjRkZGREY4Ii8+Cjwvc3ZnPg==" as const;

function deserializeTx(bytes: Uint8Array): Transaction | VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

function serializeTx(tx: Transaction | VersionedTransaction): Uint8Array {
  return tx instanceof VersionedTransaction
    ? tx.serialize()
    : new Uint8Array(tx.serialize({ requireAllSignatures: false }));
}

type ChangeListener = (props: {
  accounts?: readonly WalletStandardAccount[];
}) => void;

interface WalletStandardAccount {
  readonly address: string;
  readonly publicKey: Uint8Array;
  readonly chains: readonly string[];
  readonly features: readonly string[];
  readonly label?: string;
  readonly icon?: string;
}

class PhantomStandardWallet {
  readonly version = "1.0.0" as const;
  readonly name = "Phantom" as const;
  readonly icon = PHANTOM_ICON;
  readonly chains = SOLANA_CHAINS;

  #account: WalletStandardAccount | null = null;
  #listeners: ChangeListener[] = [];
  #getChain: () => PhantomStandardChain | null = () => null;
  #connectHandler: (() => Promise<string | null>) | null = null;

  setChainGetter(getter: () => PhantomStandardChain | null): void {
    this.#getChain = getter;
  }

  /**
   * How to actually establish a Phantom session and resolve to a Solana address.
   *
   * `useSolana().solana` enforces an existing connection, so calling its
   * `connect()` cold does nothing useful — the app's Phantom Connect flow
   * (modal → google / apple / injected / deep-link) has to run first. The
   * registrar injects that flow here.
   */
  setConnectHandler(handler: () => Promise<string | null>): void {
    this.#connectHandler = handler;
  }

  get accounts(): readonly WalletStandardAccount[] {
    return this.#account ? [this.#account] : [];
  }

  get features(): Record<string, unknown> {
    return {
      "standard:connect": {
        version: "1.0.0",
        connect: this.#connect,
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: this.#disconnect,
      },
      "standard:events": {
        version: "1.0.0",
        on: this.#on,
      },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: this.#signTransaction,
      },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: this.#signAndSendTransaction,
      },
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: this.#signMessage,
      },
    };
  }

  #chainOrThrow(): PhantomStandardChain {
    const chain = this.#getChain();
    if (!chain) throw new Error("Phantom is not available");
    return chain;
  }

  #buildAccount(address: string): WalletStandardAccount {
    return {
      address,
      publicKey: new PublicKey(address).toBytes(),
      chains: SOLANA_CHAINS,
      features: ACCOUNT_FEATURES,
      label: "Phantom",
      icon: PHANTOM_ICON,
    };
  }

  #emitChange(): void {
    const accounts = this.accounts;
    for (const l of [...this.#listeners]) l({ accounts });
  }

  /**
   * Reflect a connection made outside the Standard flow (e.g. the user logged into
   * the app with Phantom). Pass the authoritative Solana address, or null when
   * disconnected.
   */
  syncAddress(address: string | null): void {
    if (address && this.#account?.address !== address) {
      this.#account = this.#buildAccount(address);
      this.#emitChange();
    } else if (!address && this.#account) {
      this.#account = null;
      this.#emitChange();
    }
  }

  #connect = async ({ silent }: { silent?: boolean } = {}) => {
    if (this.#account) return { accounts: this.accounts };

    // Already-connected session (e.g. the user logged in with Phantom): adopt it
    // with no prompt.
    const chain = this.#getChain();
    let address = chain?.connected ? chain.publicKey : null;

    // `silent` is the Standard's "connect only if already trusted" probe — never
    // pop UI for it.
    if (!address && !silent) {
      if (!this.#connectHandler) throw new Error("Phantom is not available");
      address = await this.#connectHandler();
    }

    if (!address) {
      if (silent) return { accounts: [] };
      // Fail loudly. Returning an empty account list here is what made the widget
      // silently close its modal and do nothing.
      throw new Error("Phantom connection was cancelled or timed out");
    }

    this.#account = this.#buildAccount(address);
    this.#emitChange();
    return { accounts: this.accounts };
  };

  #disconnect = async (): Promise<void> => {
    const chain = this.#getChain();
    this.#account = null;
    try {
      await chain?.disconnect();
    } catch {
      /* ignore */
    }
    this.#emitChange();
  };

  #on = (event: string, listener: ChangeListener): (() => void) => {
    if (event !== "change") return () => {};
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== listener);
    };
  };

  #signTransaction = async (...inputs: any[]) => {
    // Deeplink sign may leave the page — return to the swap afterward.
    savePhantomReturnContext({ resumeSwap: true });
    preferLifiPhantomWallet();
    const chain = this.#chainOrThrow();
    const txs = inputs.map((input) => deserializeTx(input.transaction));

    // One round-trip for the whole batch when the chain supports it. On mobile
    // this is not an optimisation: the first deeplink unloads the page, so a
    // loop would silently drop every transaction after the first.
    if (txs.length > 1 && chain.signAllTransactions) {
      const signed = await chain.signAllTransactions(txs as any[]);
      return signed.map((tx) => ({ signedTransaction: serializeTx(tx) }));
    }

    const outputs: { signedTransaction: Uint8Array }[] = [];
    for (const tx of txs) {
      const signed = await chain.signTransaction(tx as any);
      outputs.push({ signedTransaction: serializeTx(signed) });
    }
    return outputs;
  };

  #signAndSendTransaction = async (...inputs: any[]) => {
    savePhantomReturnContext({ resumeSwap: true });
    preferLifiPhantomWallet();
    const chain = this.#chainOrThrow();
    const outputs: { signature: Uint8Array }[] = [];
    for (const input of inputs) {
      const tx = deserializeTx(input.transaction);
      const { signature } = await chain.signAndSendTransaction(tx);
      outputs.push({ signature: bs58.decode(signature) });
    }
    return outputs;
  };

  #signMessage = async (...inputs: any[]) => {
    savePhantomReturnContext({ resumeSwap: true });
    const chain = this.#chainOrThrow();
    const outputs: { signedMessage: Uint8Array; signature: Uint8Array }[] = [];
    for (const input of inputs) {
      const { signature } = await chain.signMessage(input.message);
      outputs.push({ signedMessage: input.message, signature });
    }
    return outputs;
  };
}

let singleton: PhantomStandardWallet | null = null;
let registered = false;

/** Idempotently register the Phantom Standard wallet and return the singleton. */
export function registerPhantomStandardWallet(): PhantomStandardWallet {
  if (!singleton) singleton = new PhantomStandardWallet();
  if (!registered) {
    registerWallet(singleton as any);
    registered = true;
  }
  return singleton;
}

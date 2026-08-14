/**
 * Persistent state for the Phantom deeplink flow.
 *
 * Every Phantom deeplink round-trip destroys the page: we navigate to Phantom,
 * Phantom navigates back to `/phantom/callback`. Nothing in memory survives, so
 * the keypair, the shared secret, the session token and the "what were we in the
 * middle of" marker all have to live in storage.
 *
 * `localStorage`, not `sessionStorage`: iOS Safari may re-create the tab on the
 * way back, which drops sessionStorage.
 *
 * Note this puts an x25519 secret key and a Phantom session token (which does
 * NOT expire — see Phantom's `handling-sessions` docs) in localStorage, where
 * any XSS on this origin can read them. `clearPhantomSession()` is the mitigation
 * we expose to users via disconnect.
 */
import bs58 from "bs58";
import { createDappKeypair, type DappKeypair } from "./crypto";

const SECRET_KEY = "phantom_dl_secret";
const SHARED_KEY = "phantom_dl_shared";
const SESSION_KEY = "phantom_dl_session";
const PUBKEY_KEY = "phantom_dl_pubkey";
const PENDING_KEY = "phantom_dl_pending";

/** What we were doing when we handed control to the Phantom app. */
export type PendingAction =
  | { kind: "connect"; returnTo: string }
  | {
      kind: "signTransactions";
      returnTo: string;
      /** Where to write the resulting txHash back into Li.Fi's persisted route. */
      routeId: string;
      stepId: string;
      processType: string;
    };

function get(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

function del(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Mint and persist a new dapp keypair. Called right before `connect` — Phantom
 * recommends a fresh keypair per session.
 */
export function createAndStoreDappKeypair(): DappKeypair {
  const kp = createDappKeypair();
  set(SECRET_KEY, bs58.encode(kp.secretKey));
  return kp;
}

export function getDappSecretKey(): Uint8Array | null {
  const raw = get(SECRET_KEY);
  if (!raw) return null;
  try {
    return bs58.decode(raw);
  } catch {
    return null;
  }
}

export function storeSession(opts: {
  sharedSecret: Uint8Array;
  session: string;
  publicKey: string;
}): void {
  set(SHARED_KEY, bs58.encode(opts.sharedSecret));
  set(SESSION_KEY, opts.session);
  set(PUBKEY_KEY, opts.publicKey);
}

export function getSharedSecret(): Uint8Array | null {
  const raw = get(SHARED_KEY);
  if (!raw) return null;
  try {
    return bs58.decode(raw);
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  return get(SESSION_KEY);
}

/** The connected Solana address, or null when there's no live Phantom session. */
export function getPhantomAddress(): string | null {
  return get(PUBKEY_KEY);
}

/** True once `connect` has completed and we can sign without re-connecting. */
export function hasPhantomSession(): boolean {
  return Boolean(getSharedSecret() && getSessionToken() && getPhantomAddress());
}

export function clearPhantomSession(): void {
  [SECRET_KEY, SHARED_KEY, SESSION_KEY, PUBKEY_KEY, PENDING_KEY].forEach(del);
}

export function setPendingAction(action: PendingAction): void {
  set(PENDING_KEY, JSON.stringify(action));
}

/** Read + clear the in-flight action. Callback pages get exactly one shot at it. */
export function consumePendingAction(): PendingAction | null {
  const raw = get(PENDING_KEY);
  del(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAction;
  } catch {
    return null;
  }
}

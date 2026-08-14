/**
 * x25519 / NaCl-box envelope used by Phantom's `ul/v1/*` deeplinks.
 *
 * Phantom's spec: the dapp generates an x25519 keypair, sends its public key on
 * `connect`, and Phantom replies with its own. Both sides derive one shared
 * secret, which then encrypts every later request payload and decrypts every
 * response. Everything on the wire is base58.
 *
 * No `Buffer` here on purpose — this runs in the browser and Next/webpack does
 * not polyfill it.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";

const NONCE_BYTES = 24;

export interface DappKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** Fresh per connect session — Phantom maps shared secrets by dapp public key. */
export function createDappKeypair(): DappKeypair {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

/** Diffie-Hellman: our secret + Phantom's public key -> shared secret. */
export function deriveSharedSecret(
  phantomPublicKeyB58: string,
  dappSecretKey: Uint8Array,
): Uint8Array {
  return nacl.box.before(bs58.decode(phantomPublicKeyB58), dappSecretKey);
}

/** Encrypt a request payload. Returns the base58 `nonce` + `payload` params. */
export function encryptPayload(
  payload: unknown,
  sharedSecret: Uint8Array,
): { nonce: string; payload: string } {
  const nonce = nacl.randomBytes(NONCE_BYTES);
  const message = new TextEncoder().encode(JSON.stringify(payload));
  const box = nacl.box.after(message, nonce, sharedSecret);
  return { nonce: bs58.encode(nonce), payload: bs58.encode(box) };
}

/** Decrypt a `data` + `nonce` response pair. Throws if the secret is wrong. */
export function decryptPayload<T>(
  dataB58: string,
  nonceB58: string,
  sharedSecret: Uint8Array,
): T {
  const opened = nacl.box.open.after(
    bs58.decode(dataB58),
    bs58.decode(nonceB58),
    sharedSecret,
  );
  if (!opened) throw new Error("Unable to decrypt Phantom response");
  return JSON.parse(new TextDecoder().decode(opened)) as T;
}

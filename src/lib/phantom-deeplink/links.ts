/**
 * Builds and opens Phantom `ul/v1/*` universal links.
 *
 * Each of these hands control to the Phantom app and never comes back to the
 * caller — the page is unloaded. They return a promise that never settles on
 * purpose, so a caller awaiting a signature simply stops here; the result is
 * picked up by `/phantom/callback` on the next page load.
 *
 * Deliberately using `signTransaction` / `signAllTransactions` and NOT
 * `signAndSendTransaction`:
 *   1. Phantom has deprecated `signAndSendTransaction`.
 *   2. Li.Fi broadcasts Solana transactions itself, so we want the signed bytes
 *      back rather than having Phantom broadcast behind our back — that keeps a
 *      single, known broadcaster and makes "did it land?" decidable.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { isChromiumAndroid, isIos, isMobileLikeDevice } from "./device";
import { encryptPayload } from "./crypto";
import {
  createAndStoreDappKeypair,
  getDappSecretKey,
  getSessionToken,
  getSharedSecret,
  setPendingAction,
} from "./session";
import type { PendingSignTarget } from "./lifiRoutes";

/**
 * MUST be phantom.com, not the phantom.app you'll see all over Phantom's docs.
 *
 * phantom.app now 301s to phantom.com and serves no association file (its
 * assetlinks.json is a 404). iOS fetches the AASA without following redirects,
 * and Android verifies App Links against the origin domain — so a phantom.app/ul
 * link can no longer hand off to the app at all. The browser just follows the
 * redirect and dumps the user on phantom.com/download.
 *
 * phantom.com is the domain that actually registers `/ul/*` (appID
 * 74UR4AUZ34.app.phantom / package app.phantom). Verify against
 * https://phantom.com/.well-known/apple-app-site-association before changing.
 */
const PHANTOM_HOST = "phantom.com";
const PHANTOM_UL = `https://${PHANTOM_HOST}/ul/v1`;

/** Package name taken from https://phantom.com/.well-known/assetlinks.json. */
const PHANTOM_ANDROID_PACKAGE = "app.phantom";
const PHANTOM_PLAY_STORE = `https://play.google.com/store/apps/details?id=${PHANTOM_ANDROID_PACKAGE}`;
/** App ID 1598432977 — verified on apps.apple.com, not guessed. */
const PHANTOM_APP_STORE =
  "https://apps.apple.com/app/phantom-crypto-wallet/id1598432977";

/** Phantom's custom protocol handler — the documented alternative to universal links. */
const PHANTOM_SCHEME = "phantom://v1";

/** How long to let the Phantom app take over before we conclude it isn't installed. */
const APP_OPEN_GRACE_MS = 2500;

interface Deeplink {
  url: string;
  /**
   * Store URL to send the user to if the Phantom app never takes over.
   *
   * Only set when the navigation itself CANNOT fall back — i.e. we used the
   * `phantom://` scheme, which silently does nothing when no app handles it, leaving
   * our page alive to redirect. Null when the browser handles the fallback for us.
   */
  storeFallback: string | null;
}

/**
 * Where to send the user for this deeplink.
 *
 * A plain `https://phantom.com/ul/...` link is BOTH an app link and a real web page.
 * If Phantom is installed the OS intercepts it; if not, the browser simply loads it
 * and Phantom serves their download page. Mobile web has no "is this app installed?"
 * API, so one URL has to serve both cases.
 *
 * ANDROID / CHROMIUM — `intent://` names the target package AND a fallback, so Chrome
 * opens Phantom when present and goes to the Play Store when it isn't. Deterministic.
 *
 * ANDROID / FIREFOX — `intent://` is a Chromium extension. Firefox ignores
 * `S.browser_fallback_url` and simply loads the embedded `scheme=https` URL, dumping
 * the user on phantom.com/download. So we must NOT hand Firefox an https URL at all.
 * Phantom's custom scheme (`phantom://v1/...`) has no web page behind it: if no app
 * handles it, the browser stays put — which leaves our page alive to redirect to the
 * Play Store itself (see `armPlayStoreFallback`).
 *
 * iOS — has no `intent://` equivalent. A universal link would send a user without
 * Phantom to phantom.com/download rather than the App Store, so iOS uses the custom
 * scheme too and we own the fallback, exactly as on Firefox.
 *
 * ANY OTHER PHONE/TABLET — including one in Chrome's "Desktop site" mode, which strips
 * `Android` from the user agent. It is NOT enough to test the UA here: this function
 * once did, and a phone in desktop mode fell through to the desktop branch and got the
 * https link, i.e. phantom.com/download. `isMobileLikeDevice()` sees through the spoof
 * (coarse pointer = a finger), and `phantom://` works on both platforms, so any
 * mobile-like device gets the scheme regardless of what its UA claims.
 *
 * TRADE-OFF ON iOS: when no app handles `phantom://`, Safari shows a "Cannot Open
 * Page" alert before our timer redirects to the App Store. Users WITH Phantom never
 * see it — the app opens immediately. Phantom's docs nominally prefer universal links,
 * so if the installed-user path ever regresses, reverting iOS to `PHANTOM_UL` (with
 * `storeFallback: null`) restores the old behaviour.
 */
function buildDeeplink(method: string, params: URLSearchParams): Deeplink {
  const query = params.toString();

  if (isChromiumAndroid()) {
    // Everything after `#Intent;` is the intent spec, not a URL fragment. The
    // fallback must be percent-encoded because `;` terminates fields here.
    const spec = [
      "scheme=https",
      `package=${PHANTOM_ANDROID_PACKAGE}`,
      `S.browser_fallback_url=${encodeURIComponent(PHANTOM_PLAY_STORE)}`,
      "end",
    ].join(";");
    return {
      url: `intent://${PHANTOM_HOST}/ul/v1/${method}?${query}#Intent;${spec}`,
      storeFallback: null, // Chrome handles it via browser_fallback_url.
    };
  }

  // Every other phone/tablet — Firefox, Samsung's non-Chrome shells, iOS, and any
  // device whose UA is spoofed by "Desktop site" mode. `phantom://` never lands on a
  // web page, so we always own the store fallback here.
  if (isMobileLikeDevice()) {
    return {
      url: `${PHANTOM_SCHEME}/${method}?${query}`,
      storeFallback: isIos() ? PHANTOM_APP_STORE : PHANTOM_PLAY_STORE,
    };
  }

  // Desktop / anything else: the plain universal link.
  return {
    url: `${PHANTOM_UL}/${method}?${query}`,
    storeFallback: null,
  };
}

/**
 * If the Phantom app doesn't take over within a moment, send the user to the store
 * to install it.
 *
 * Only armed when the navigation itself cannot fall back (the `phantom://` scheme
 * silently does nothing when no app handles it). The instant Phantom opens, the page
 * is backgrounded — visibilitychange/pagehide/blur all fire — and we cancel. Missing
 * that cancellation would bounce a user who DOES have Phantom out to the store while
 * they're mid-approval, so we listen for all three and re-check `document.hidden`
 * before firing.
 */
function armStoreFallback(storeUrl: string): void {
  let cancelled = false;

  const cleanup = () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", cancel);
    window.removeEventListener("blur", cancel);
  };
  function cancel() {
    cancelled = true;
    cleanup();
  }
  function onVisibilityChange() {
    if (document.hidden) cancel();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", cancel);
  window.addEventListener("blur", cancel);

  window.setTimeout(() => {
    cleanup();
    // Still here and still visible → nothing handled `phantom://`, so it isn't installed.
    if (cancelled || document.hidden) return;
    window.location.href = storeUrl;
  }, APP_OPEN_GRACE_MS);
}

const CALLBACK_PATH = "/phantom/callback";

/**
 * Where Phantom sends the user back to.
 *
 * Path-only: Phantom appends its response with `?`, so this must never carry a
 * query string of its own.
 *
 * THE iOS CHROME TRAP. Phantom returns via a universal link, and iOS hands universal
 * links to the user's DEFAULT browser — not the one they were actually using. A user
 * who starts in Chrome is therefore dumped into Safari on the way back, and the
 * session lands in Safari's localStorage: a different storage jar from the Chrome tab
 * they started in. That tab is then stranded — it has no session and no way to ever
 * get one, which reads to the user as "connecting silently did nothing".
 *
 * Chrome for iOS registers `googlechromes://` (https with the scheme swapped; the
 * host and path are preserved) precisely so another app can name it as a return
 * target, and Phantom permits a custom scheme as `redirect_link` — its own docs use
 * `mydapp://onPhantomConnected`. So we send the return trip explicitly back into the
 * browser the user is standing in.
 *
 * Only Chrome is special-cased. It's the one common non-default iOS browser with a
 * PATH-PRESERVING scheme. Firefox's `firefox://open-url?url=...` carries the target
 * as a query parameter, which Phantom's `?data=...` append would corrupt — so it, and
 * anything else, falls back to https and returns via the default browser.
 */
function redirectLink(): string {
  const { origin, host, protocol } = window.location;
  // CriOS only ever appears in Chrome-for-iOS's user agent.
  const isIosChrome = /CriOS/i.test(navigator.userAgent);

  if (isIosChrome && protocol === "https:") {
    return `googlechromes://${host}${CALLBACK_PATH}`;
  }
  return `${origin}${CALLBACK_PATH}`;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Hand off to the Phantom app. Never settles — either the app takes over, or we
 * redirect to the store. Either way this page is done.
 */
function navigateAndHang<T>(link: Deeplink): Promise<T> {
  if (link.storeFallback) armStoreFallback(link.storeFallback);
  window.location.href = link.url;
  return new Promise<T>(() => {});
}

/**
 * Phantom keys its stored shared secret by our x25519 public key, so every request
 * after `connect` must present the same one. Recover it from the persisted secret.
 */
function dappPublicKey(): Uint8Array {
  const secret = getDappSecretKey();
  if (!secret) throw new Error("Phantom session is missing — connect first");
  return nacl.box.keyPair.fromSecretKey(secret).publicKey;
}

/**
 * Open the Phantom app to authorize this dapp. Never resolves: control returns
 * via `/phantom/callback`, which stores the session and bounces back to `returnTo`.
 */
export function openPhantomConnect(returnTo = currentPath()): Promise<never> {
  const keypair = createAndStoreDappKeypair();
  setPendingAction({ kind: "connect", returnTo });

  const params = new URLSearchParams({
    app_url: window.location.origin,
    dapp_encryption_public_key: bs58.encode(keypair.publicKey),
    redirect_link: redirectLink(),
    cluster: "mainnet-beta",
  });
  return navigateAndHang(buildDeeplink("connect", params));
}

/**
 * Open the Phantom app to sign (NOT send) one or more transactions.
 *
 * `target` tells the callback which Li.Fi process to credit with the txHash once
 * we've broadcast the signed bytes ourselves.
 */
export function openPhantomSignTransactions(
  serializedTxs: Uint8Array[],
  target: PendingSignTarget,
  returnTo = currentPath(),
): Promise<never> {
  const sharedSecret = getSharedSecret();
  const session = getSessionToken();
  if (!sharedSecret || !session) {
    throw new Error("Phantom session is missing — connect first");
  }

  const transactions = serializedTxs.map((tx) => bs58.encode(tx));
  const single = transactions.length === 1;

  const { nonce, payload } = encryptPayload(
    single
      ? { session, transaction: transactions[0] }
      : { session, transactions },
    sharedSecret,
  );

  setPendingAction({
    kind: "signTransactions",
    returnTo,
    routeId: target.routeId,
    stepId: target.stepId,
    processType: target.processType,
  });

  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dappPublicKey()),
    nonce,
    redirect_link: redirectLink(),
    payload,
  });

  const method = single ? "signTransaction" : "signAllTransactions";
  return navigateAndHang(buildDeeplink(method, params));
}

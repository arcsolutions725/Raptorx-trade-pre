/**
 * ONE definition of "what kind of device is this", shared by everything Phantom.
 *
 * This file exists because having two of them caused a real bug: the code that
 * decided WHETHER to deeplink used a coarse-pointer check (correct under Chrome's
 * "Desktop site" mode), while the code that decided WHICH LINK to build sniffed
 * `/Android/` in the user agent — which Desktop-site mode strips. The two disagreed,
 * so a phone in desktop mode was correctly routed to the deeplink flow and then
 * handed a DESKTOP-style https link, which just renders phantom.com/download.
 *
 * Rule of thumb: never re-derive the platform locally. Import from here.
 */

const MOBILE_UA =
  /android|iphone|ipad|ipod|blackberry|windows phone|mobile|tablet|silk|kindle|opera mini|opera mobi/;

function ua(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

function touchPoints(): number {
  return typeof navigator === "undefined" ? 0 : (navigator.maxTouchPoints ?? 0);
}

/**
 * A phone or tablet — including one lying about it.
 *
 * The user-agent test alone is not enough: Chrome's "Desktop site" toggle, some
 * WebView/TWA shells, and iPadOS 13+ all report a DESKTOP user agent. A coarse
 * pointer means a finger rather than a mouse, and no UA spoofing changes that.
 */
export function isMobileLikeDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (MOBILE_UA.test(ua().toLowerCase())) return true;
    const coarsePointer =
      window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    return coarsePointer && touchPoints() > 0;
  } catch {
    return false;
  }
}

/** iPadOS 13+ reports a Mac UA, so the touch count is what gives it away. */
export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const agent = ua();
  return (
    /iPhone|iPad|iPod/i.test(agent) ||
    (/Macintosh/i.test(agent) && touchPoints() > 1)
  );
}

/** Only trustworthy when the UA is intact — see `isChromiumAndroid`. */
export function isAndroid(): boolean {
  return /Android/i.test(ua());
}

/**
 * `intent://` is a Chromium feature — Firefox for Android ignores its
 * `S.browser_fallback_url` and loads the embedded https URL instead.
 *
 * Deliberately UA-based: this gates an OPTIMISATION (Chrome's native store
 * fallback), so a false negative is harmless — the caller falls back to the
 * `phantom://` scheme, which works everywhere.
 */
export function isChromiumAndroid(): boolean {
  return isAndroid() && /Chrome/i.test(ua());
}

/** True when a Phantom provider is already injected (extension, or Phantom's own
 *  in-app browser). Then Phantom registers its own Standard wallet and we must not
 *  shadow it with ours. */
export function hasInjectedPhantom(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    phantom?: { solana?: unknown };
    solana?: { isPhantom?: boolean };
  };
  return Boolean(w.phantom?.solana || w.solana?.isPhantom);
}

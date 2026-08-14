/**
 * Preserve navigation context when Phantom Connect leaves the page
 * (extension popup stays on-page; deeplink/OAuth navigates away).
 *
 * localStorage, NOT sessionStorage. sessionStorage is scoped to a single tab, and
 * the Phantom app hands its response back to the OS, which opens it in a BRAND NEW
 * tab — one with a fresh, empty sessionStorage. So a flag written before the
 * hand-off could never be read after it: the user came back to the right page, but
 * the swap panel stayed collapsed because the resume flag was stranded in a tab
 * nobody was looking at any more. localStorage is shared across tabs on the origin,
 * so it survives the hop.
 */

const RETURN_TO_KEY = "phantom_return_to";
const RESUME_SWAP_KEY = "phantom_resume_swap";

/**
 * Cross-tab storage outlives the round trip, so unlike a sessionStorage flag it can
 * also outlive its usefulness. Bound it: a resume flag older than this is a leftover
 * from an abandoned attempt, not a user who just approved in Phantom.
 */
const RESUME_TTL_MS = 15 * 60_000;

function isSafeRelativePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

/** Call right before opening Phantom (connect or sign). */
export function savePhantomReturnContext(opts?: {
  path?: string;
  /** Re-open the swap panel after returning from the Phantom app. */
  resumeSwap?: boolean;
}): void {
  if (typeof window === "undefined") return;
  const path =
    opts?.path ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  try {
    if (isSafeRelativePath(path)) {
      localStorage.setItem(RETURN_TO_KEY, path);
    }
    if (opts?.resumeSwap) {
      localStorage.setItem(RESUME_SWAP_KEY, String(Date.now()));
    }
  } catch {
    /* private mode / quota */
  }
}

/** Read + clear return path. Falls back to `/` if missing/unsafe. */
export function consumePhantomReturnUrl(fallback = "/"): string {
  if (typeof window === "undefined") return fallback;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RETURN_TO_KEY);
    localStorage.removeItem(RETURN_TO_KEY);
  } catch {
    return fallback;
  }
  if (!raw || !isSafeRelativePath(raw)) return fallback;
  if (raw.startsWith("/auth/callback")) return fallback;
  return raw;
}

/**
 * Non-destructive read of the resume flag.
 *
 * `consumePhantomResumeSwap` is first-reader-wins, and React runs CHILD effects
 * before parent ones — so the report component always consumes the flag before its
 * shell could ever react to it. A parent that needs to know (e.g. to open the panel
 * the report lives in) has to peek during render instead, while the flag is still
 * there, and leave the consuming to the child.
 */
export function peekPhantomResumeSwap(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(RESUME_SWAP_KEY);
    if (!raw) return false;
    const savedAt = Number(raw);
    return Number.isFinite(savedAt) && Date.now() - savedAt < RESUME_TTL_MS;
  } catch {
    return false;
  }
}

/** True once if we should reopen the swap panel after Phantom returns. */
export function consumePhantomResumeSwap(): boolean {
  if (typeof window === "undefined") return false;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RESUME_SWAP_KEY);
    localStorage.removeItem(RESUME_SWAP_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  const savedAt = Number(raw);
  return Number.isFinite(savedAt) && Date.now() - savedAt < RESUME_TTL_MS;
}

/**
 * Tell @solana/wallet-adapter-react (Li.Fi SVM) to prefer Phantom on the next
 * mount so autoConnect picks up our Standard wallet after a deeplink return.
 */
export function preferLifiPhantomWallet(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("walletName", JSON.stringify("Phantom"));
  } catch {
    /* ignore quota / private mode */
  }
}

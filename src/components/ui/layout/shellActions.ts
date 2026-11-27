import { REX_SCREENER_ALL_HREF } from "@/lib/rexscreenerRoutes";

/**
 * The phone tab bar lives in the Footer, but Account and Exchange belong to the Header
 * (it owns the login / account modals and the page's Exchange handler). The Footer asks
 * the Header through this window event; the Header marks the request as handled.
 */
export const RX_SHELL_ACTION_EVENT = "rx:shell-action";

/** "pilot": open/close the page's Rex Pilot sidebar (the Header's Claw AI 5.0 handler), e.g. from the token bar.
 *  "deposit": the Header's Deposit popup (log in first when signed out), e.g. from the Portfolio page.
 *  "missions" / "leaderboard": the Header's Daily missions / Leaderboard popups (log in first when signed out),
 *  e.g. from the Footer's dock.
 *  "referrals": the account popup opened on its Referrals tab (e.g. the missions popup's "Get link"). */
export type RxShellAction =
  | "account"
  | "referrals"
  | "exchange"
  | "pilot"
  | "deposit"
  | "missions"
  | "leaderboard";

export type RxShellActionDetail = {
  action: RxShellAction;
  /** Set to true by the listener that took care of it. */
  handled: boolean;
};

/** RexScreener opens its Exchange panel when it loads with `?exchange=1`. */
export const REX_SCREENER_EXCHANGE_PARAM = "exchange";
export const REX_SCREENER_EXCHANGE_HREF = `${REX_SCREENER_ALL_HREF}?${REX_SCREENER_EXCHANGE_PARAM}=1`;

/**
 * Golden / Pump Reports views of the RexScreener list (the header search's "Golden Reports" /
 * "Pump Reports" pages, design/js/universal.js PAGES). The list opens the view when it loads with
 * `?reports=golden|pump`, or in place through the event when it is already on screen.
 */
/** Chain names for the RexScreener eyebrow ("RexScreener · Base"). */
export const SCREENER_CHAIN_EYEBROW: Record<string, string> = {
  base: "Base",
  robinhood: "Robinhood",
  ethereum: "Ethereum",
  solana: "Solana",
  bsc: "BNB Chain",
  monad: "Monad",
  all: "All chains",
};

export type ScreenerReportsType = "golden" | "pump";
export const REX_SCREENER_REPORTS_PARAM = "reports";
export const REX_SCREENER_REPORTS_EVENT = "rx:screener-reports";
export const screenerReportsHref = (type: ScreenerReportsType) =>
  `${REX_SCREENER_ALL_HREF}?${REX_SCREENER_REPORTS_PARAM}=${type}`;

/** Open a Reports view on the mounted token list. Returns false when no list took it (navigate instead). */
export function requestScreenerReports(type: ScreenerReportsType): boolean {
  if (typeof window === "undefined") return false;
  const ev = new CustomEvent<ScreenerReportsType>(REX_SCREENER_REPORTS_EVENT, {
    detail: type,
    cancelable: true,
  });
  // the list calls preventDefault() when it opened the view
  return !window.dispatchEvent(ev);
}

/** Ask the mounted Header to run a shell action. Returns false when nothing handled it. */
export function requestShellAction(action: RxShellAction): boolean {
  if (typeof window === "undefined") return false;
  const detail: RxShellActionDetail = { action, handled: false };
  window.dispatchEvent(
    new CustomEvent<RxShellActionDetail>(RX_SHELL_ACTION_EVENT, { detail }),
  );
  return detail.handled;
}

/* ---------- Rewards dock (Daily missions + Leaderboard) ----------
 * The Header owns the signed-in user, the missions count and both popups ("missions" / "leaderboard"
 * shell actions). It publishes what the dock buttons need here so the Footer's dock (desktop) can show
 * them on every page. Plain module store (no React), read with useSyncExternalStore. */

export type RxShellRewards = {
  /** Database user id (from /api/user). The dock only shows once it is known. */
  userId: string;
  /** Daily missions completed today and how many there are. null until /api/daily-tasks answers. */
  missionsDone: number | null;
  missionsTotal: number | null;
};

let shellRewards: RxShellRewards | null = null;
let shellRewardsOwner: symbol | null = null;
const shellRewardsListeners = new Set<() => void>();

/** Publish (or clear with null) the rewards state. `owner` keeps a second, unmounting Header from
 *  clearing what the mounted one published. */
export function setShellRewards(owner: symbol, next: RxShellRewards | null): void {
  if (next === null && shellRewardsOwner !== null && shellRewardsOwner !== owner) return;
  const prev = shellRewards;
  if (
    prev === next ||
    (prev &&
      next &&
      prev.userId === next.userId &&
      prev.missionsDone === next.missionsDone &&
      prev.missionsTotal === next.missionsTotal)
  ) {
    shellRewardsOwner = next ? owner : null;
    return;
  }
  shellRewards = next;
  shellRewardsOwner = next ? owner : null;
  shellRewardsListeners.forEach((l) => l());
}

export function getShellRewards(): RxShellRewards | null {
  return shellRewards;
}

export function subscribeShellRewards(listener: () => void): () => void {
  shellRewardsListeners.add(listener);
  return () => {
    shellRewardsListeners.delete(listener);
  };
}

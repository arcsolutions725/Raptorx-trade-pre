import { REX_SCREENER_ALL_HREF } from "@/lib/rexscreenerRoutes";

/**
 * The phone tab bar lives in the Footer, but Account and Exchange belong to the Header
 * (it owns the login / account modals and the page's Exchange handler). The Footer asks
 * the Header through this window event; the Header marks the request as handled.
 */
export const RX_SHELL_ACTION_EVENT = "rx:shell-action";

/** "pilot": open/close the page's Rex Pilot sidebar (the Header's Claw AI 5.0 handler), e.g. from the token bar. */
export type RxShellAction = "account" | "exchange" | "pilot";

export type RxShellActionDetail = {
  action: RxShellAction;
  /** Set to true by the listener that took care of it. */
  handled: boolean;
};

/** RexScreener opens its Exchange panel when it loads with `?exchange=1`. */
export const REX_SCREENER_EXCHANGE_PARAM = "exchange";
export const REX_SCREENER_EXCHANGE_HREF = `${REX_SCREENER_ALL_HREF}?${REX_SCREENER_EXCHANGE_PARAM}=1`;

/** Ask the mounted Header to run a shell action. Returns false when nothing handled it. */
export function requestShellAction(action: RxShellAction): boolean {
  if (typeof window === "undefined") return false;
  const detail: RxShellActionDetail = { action, handled: false };
  window.dispatchEvent(
    new CustomEvent<RxShellActionDetail>(RX_SHELL_ACTION_EVENT, { detail }),
  );
  return detail.handled;
}

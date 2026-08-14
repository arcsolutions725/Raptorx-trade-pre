/**
 * Cross-tab cleanup for the return trip from Phantom.
 *
 * Phantom fires our `redirect_link` as an OS intent, and Chrome opens an external
 * intent in a NEW tab — it will not reuse the tab the user started in. So after a
 * connect or a signature the user has two tabs: the stale original, and the fresh
 * one that actually completed the flow.
 *
 * The new tab is the one that wins: it holds the completed session and the patched
 * Li.Fi route, and it's the one the user is looking at. So it tells the old tab(s)
 * to close.
 *
 * Best-effort by design: Chrome only lets a script close a window that a script
 * opened, and the user's original tab was opened by the user. When the close is
 * refused the old tab simply stays put — stale, but harmless, since every tab on
 * this origin reads the same localStorage.
 */
const CHANNEL = "raptorx-phantom";

export interface PhantomTakeoverMessage {
  type: "phantom:takeover";
}

/** Sent by the post-Phantom tab: "I'm the live one now — close yourself." */
export function broadcastPhantomTakeover(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    const message: PhantomTakeoverMessage = { type: "phantom:takeover" };
    channel.postMessage(message);
    channel.close();
  } catch {
    /* unsupported / blocked */
  }
}

/** Listen for a newer tab taking over. Returns an unsubscribe fn. */
export function onPhantomTakeover(handler: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    return () => {};
  }
  channel.onmessage = (event: MessageEvent<PhantomTakeoverMessage>) => {
    if (event.data?.type === "phantom:takeover") handler();
  };
  return () => channel.close();
}

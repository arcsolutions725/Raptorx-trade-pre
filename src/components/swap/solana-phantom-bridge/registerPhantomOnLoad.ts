/**
 * Registers the Phantom Wallet Standard wallet AT MODULE LOAD, before React
 * renders a single component.
 *
 * This is not premature optimisation — it fixes a real race. Li.Fi discovers
 * wallets through `useStandardWalletAdapters`, which snapshots the wallet registry
 * during RENDER:
 *
 *   const [standardAdapters] = useState(() => wrapWalletsWithAdapters(get()))
 *
 * and only subscribes to `register` events afterwards, in an effect. There is no
 * re-sync between the two. So a wallet registered from another component's effect
 * can fall straight through the gap: the snapshot was taken before it existed, and
 * its `register` event fired before anyone was listening. Li.Fi then never sees
 * Phantom at all — the widget shows "Connect wallet" even with a perfectly valid
 * session, because `StandardWalletAdapter` can only auto-connect a wallet that is
 * in that list.
 *
 * Module evaluation always precedes the first render, so registering here closes
 * the gap for good.
 *
 * The address is seeded from the deeplink session too: `StandardWalletAdapter`
 * skips its connect call entirely when `wallet.accounts` is already populated
 * (adapter.js: `if (!wallet.accounts.length) await connect(...)`), so a returning
 * user is reconnected with no prompt and no round-trip.
 */
import {
  hasInjectedPhantom,
  isMobileLikeDevice,
} from "@/lib/phantom-deeplink/device";
import { getPhantomAddress } from "@/lib/phantom-deeplink/session";
import { registerPhantomStandardWallet } from "./phantomStandardWallet";

export { hasInjectedPhantom, isMobileLikeDevice };

/**
 * True when Phantom can only be reached by leaving the page — i.e. mobile web with
 * no injected provider. Desktop with the extension (and Phantom's own in-app browser)
 * already expose a real Standard wallet, which we must not shadow.
 */
export function isPhantomDeeplinkEnv(): boolean {
  if (typeof window === "undefined") return false;
  if (hasInjectedPhantom()) return false;
  return isMobileLikeDevice();
}

if (isPhantomDeeplinkEnv()) {
  registerPhantomStandardWallet().syncAddress(getPhantomAddress());
}

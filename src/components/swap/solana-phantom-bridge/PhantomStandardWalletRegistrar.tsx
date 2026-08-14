"use client";

/**
 * Registers a Wallet Standard "Phantom" for Li.Fi when the browser extension is
 * not injected, and wires connect so:
 *
 *  Desktop + extension → Phantom extension popup (RaptorX stays open)
 *  Mobile / tablet     → Phantom app via `ul/v1` deeplinks (see phantomDeeplinkChain)
 *  Desktop, no ext     → Install Phantom extension prompt
 *
 * On mobile we deliberately do NOT use Phantom Connect's `"deeplink"` provider.
 * That provider resolves to `phantom.app/ul/browse/<url>`, which merely re-opens
 * RaptorX inside Phantom's in-app browser — a different app session, so the user
 * has to log in again and never actually connects their wallet to the page they
 * started on. The `ul/v1` protocol is the one that hands off to the Phantom app
 * for an approval and comes back. (That SDK URL is also on the dead phantom.app
 * domain — see the host note in `phantom-deeplink/links.ts`.)
 *
 * Never call bare `provider: "injected"` without a discovered walletId —
 * that throws `Unknown injected wallet id: phantom`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useDiscoveredWallets,
  useIsExtensionInstalled,
  useSolana,
} from "@phantom/react-sdk";
import { waitForPhantomExtension } from "@phantom/browser-sdk";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import {
  preferLifiPhantomWallet,
  savePhantomReturnContext,
} from "@/lib/phantomReturnUrl";
import { onPhantomTakeover } from "@/lib/phantom-deeplink/channel";
import { openPhantomConnect } from "@/lib/phantom-deeplink/links";
import { getPhantomAddress } from "@/lib/phantom-deeplink/session";
import {
  registerPhantomStandardWallet,
  type PhantomStandardChain,
} from "./phantomStandardWallet";
import { createPhantomDeeplinkChain } from "./phantomDeeplinkChain";
import {
  hasInjectedPhantom,
  isMobileLikeDevice,
  isPhantomDeeplinkEnv,
} from "./registerPhantomOnLoad";
import { PhantomDesktopConnectModal } from "./PhantomDesktopConnectModal";

const CONNECT_TIMEOUT_MS = 180_000;
const POLL_MS = 250;
/** How long to give `window.close()` before concluding Chrome refused it. */
const CLOSE_GRACE_MS = 300;

function findPhantomWallet(
  wallets: { id: string; name?: string; rdns?: string }[],
) {
  return (
    wallets.find(
      (w) =>
        w.id === "phantom" ||
        w.name?.toLowerCase() === "phantom" ||
        w.rdns?.includes("phantom"),
    ) ?? null
  );
}

export function PhantomStandardWalletRegistrar() {
  const { solana } = useSolana();
  const { connect, user, clearError } = usePhantomConnect();
  const { isInstalled: extensionInstalled, isLoading: extensionLoading } =
    useIsExtensionInstalled();
  const { wallets: discoveredWallets, refetch: refetchWallets } =
    useDiscoveredWallets();

  const [desktopPromptOpen, setDesktopPromptOpen] = useState(false);

  /**
   * Mobile web has no extension to inject, so signing has to leave the page and
   * come back through `/phantom/callback`. The wallet itself is already registered
   * at module load (see `registerPhantomOnLoad`) — this just tells the component
   * which chain to drive.
   */
  const [deeplinkMode] = useState(isPhantomDeeplinkEnv);

  /** Set once a newer tab (post-Phantom) takes over and this one is stale. */
  const [superseded, setSuperseded] = useState(false);

  const deeplinkChainRef = useRef<PhantomStandardChain | null>(null);
  if (!deeplinkChainRef.current) {
    deeplinkChainRef.current = createPhantomDeeplinkChain();
  }

  // On mobile the address lives in the deeplink session (localStorage), not in the
  // Phantom Connect user — the two are independent, which is exactly why the mobile
  // flow no longer drags the user through a second login.
  const solanaAddress = deeplinkMode
    ? getPhantomAddress()
    : (user?.solanaWallet ?? null);

  const chainRef = useRef<PhantomStandardChain | null>(null);
  chainRef.current = deeplinkMode
    ? deeplinkChainRef.current
    : (solana as unknown as PhantomStandardChain);
  const addressRef = useRef<string | null>(null);
  addressRef.current = solanaAddress;
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const clearErrorRef = useRef(clearError);
  clearErrorRef.current = clearError;
  const discoveredRef = useRef(discoveredWallets);
  discoveredRef.current = discoveredWallets;
  const refetchRef = useRef(refetchWallets);
  refetchRef.current = refetchWallets;
  const extensionInstalledRef = useRef(extensionInstalled);
  extensionInstalledRef.current = extensionInstalled;

  const waitForAddress = useCallback(async (): Promise<string | null> => {
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (addressRef.current) {
        preferLifiPhantomWallet();
        return addressRef.current;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    return null;
  }, []);

  /** Prefer extension popup whenever Phantom is (or becomes) available. */
  const connectInjectedExtension = useCallback(async (): Promise<boolean> => {
    await waitForPhantomExtension(2500).catch(() => false);
    try {
      await refetchRef.current();
    } catch {
      /* ignore */
    }
    // Give discovery a beat after waitForPhantomExtension
    await new Promise((r) => setTimeout(r, 150));

    let phantomWallet = findPhantomWallet(discoveredRef.current);
    if (!phantomWallet && (hasInjectedPhantom() || extensionInstalledRef.current)) {
      // Registry lag — try canonical id once injection is present.
      phantomWallet = { id: "phantom", name: "Phantom" };
    }
    if (!phantomWallet) return false;

    try {
      await connectRef.current({
        provider: "injected",
        walletId: phantomWallet.id,
      });
      return true;
    } catch {
      clearErrorRef.current("connect");
      return false;
    }
  }, []);

  const runConnect = useCallback(async (): Promise<string | null> => {
    if (addressRef.current) {
      preferLifiPhantomWallet();
      return addressRef.current;
    }

    savePhantomReturnContext({ resumeSwap: true });
    preferLifiPhantomWallet();
    clearErrorRef.current("connect");

    // 1) Desktop / any device with extension → Phantom extension popup
    if (hasInjectedPhantom() || extensionInstalledRef.current) {
      const ok = await connectInjectedExtension();
      if (ok) return waitForAddress();
    }

    // 2) Phone / tablet without extension → hand off to the Phantom app.
    //
    // `openPhantomConnect` NEVER RESOLVES: it navigates to Phantom, which unloads
    // this page. The user approves in the app, Phantom returns them to
    // /phantom/callback, and the wallet reconnects from the stored session on the
    // next page load. There is nothing to await here.
    //
    // Re-check the device here rather than trusting only the mount-time
    // `deeplinkMode`: getting this wrong strands a phone user on the desktop
    // "install the extension" prompt, which is unactionable on Android/iOS.
    if (deeplinkMode || isMobileLikeDevice()) {
      const existing = getPhantomAddress();
      if (existing) {
        preferLifiPhantomWallet();
        return existing;
      }
      return openPhantomConnect();
    }

    // 3) Desktop, no extension → Install Phantom prompt.
    //
    // Only ever a desktop path. Browser extensions do not exist on phones or
    // tablets, so telling a user with the Phantom app already installed to "Install
    // Phantom Extension" is a dead end — step 2 above is what they need.
    setDesktopPromptOpen(true);
    return waitForAddress();
  }, [connectInjectedExtension, waitForAddress, deeplinkMode]);

  useEffect(() => {
    // On mobile there is no extension to wait for, so wire the wallet up
    // immediately — gating this on extension detection would leave the connect
    // handler unset while the user is already able to tap "Phantom".
    if (!deeplinkMode) {
      if (extensionLoading) return;
      // Extension present → Li.Fi uses the real Standard Phantom; don't duplicate.
      if (hasInjectedPhantom() || extensionInstalled) return;
    }

    const wallet = registerPhantomStandardWallet();
    wallet.setChainGetter(() => chainRef.current);
    wallet.setConnectHandler(runConnect);
    wallet.syncAddress(addressRef.current);
  }, [runConnect, deeplinkMode, extensionInstalled, extensionLoading]);

  useEffect(() => {
    if (!deeplinkMode && (hasInjectedPhantom() || extensionInstalled)) return;
    registerPhantomStandardWallet().syncAddress(solanaAddress);
    if (solanaAddress) preferLifiPhantomWallet();
  }, [solanaAddress, deeplinkMode, extensionInstalled]);

  /**
   * The Phantom return trip lands in a NEW Chrome tab (external intents always
   * do), leaving this one behind as a stale duplicate showing a disconnected
   * wallet. The new tab finished the flow, so when it says so, this one closes.
   *
   * Chrome only lets a script close a window a script opened, and the user opened
   * this one — so `close()` is usually refused. There is no web API that can close
   * or focus another tab, so when it's refused we do the next best thing and mark
   * the tab as superseded rather than leaving a misleading dead page behind.
   */
  useEffect(() => {
    if (!deeplinkMode) return;
    return onPhantomTakeover(() => {
      window.close();
      window.setTimeout(() => setSuperseded(true), CLOSE_GRACE_MS);
    });
  }, [deeplinkMode]);

  // If user installs the extension while our prompt is open, close it and connect.
  useEffect(() => {
    if (!desktopPromptOpen) return;
    if (!extensionInstalled && !hasInjectedPhantom()) return;
    setDesktopPromptOpen(false);
    void connectInjectedExtension();
  }, [desktopPromptOpen, extensionInstalled, connectInjectedExtension]);

  return (
    <>
      <PhantomDesktopConnectModal
        open={desktopPromptOpen}
        onClose={() => setDesktopPromptOpen(false)}
      />
      {superseded && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-[#0a0a0a]/95 px-6 text-center text-white">
          <p className="text-base font-semibold">
            You continued in another tab
          </p>
          <p className="max-w-xs text-sm text-white/60">
            Phantom opened a new tab and your wallet is connected there. This tab
            is out of date — close it, or carry on here.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[#ffc000] px-5 py-2 text-sm font-semibold text-black"
          >
            Continue in this tab
          </button>
        </div>
      )}
    </>
  );
}

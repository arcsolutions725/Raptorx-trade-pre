"use client";

import { ReactNode } from "react";
import {
  PhantomProvider,
  darkTheme,
  usePhantom,
  useModal,
  useConnect,
  useDisconnect,
  useAccounts,
} from "@phantom/react-sdk";
import { AddressType } from "@phantom/browser-sdk";

interface PhantomConnectProviderProps {
  children: ReactNode;
  appId?: string;
}

function PhantomConnectInner({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function PhantomConnectProvider({
  children,
  appId,
}: PhantomConnectProviderProps) {
  const phantomAppId = appId || process.env.NEXT_PUBLIC_PHANTOM_APP_ID;
  
  // Get the base URL for redirect
  const getRedirectUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/auth/callback`;
    }
    return (
      (process.env.NEXT_PUBLIC_SITE_URL || "https://raptorx.trade") +
      "/auth/callback"
    );
  };

  // Always provide PhantomProvider so hooks can be used
  // If appId is missing, connection will fail but hooks won't throw errors
  // Use a placeholder UUID format that looks valid but won't work
  const effectiveAppId = phantomAppId || "00000000-0000-0000-0000-000000000000";

  return (
    <PhantomProvider
      config={{
        providers: ["google", "apple", "injected", "deeplink"],
        appId: effectiveAppId,
        addressTypes: [AddressType.solana, AddressType.ethereum],
        authOptions: {
          redirectUrl: getRedirectUrl(),
        },
      }}
      theme={darkTheme}
      appIcon="/images/home-logo.png"
      appName="RaptorXchange"
    >
      {!phantomAppId && process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 bg-yellow-500 text-black p-3 rounded-lg text-xs z-50 max-w-xs shadow-lg border-2 border-yellow-600">
          <strong>⚠️ Warning:</strong> NEXT_PUBLIC_PHANTOM_APP_ID is not configured.
          <br />
          <br />
          Phantom Connect will not work until you:
          <br />
          1. Get your App ID from{" "}
          <a
            href="https://phantom.app/portal"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold"
          >
            phantom.app/portal
          </a>
          <br />
          2. Add it to .env.local as NEXT_PUBLIC_PHANTOM_APP_ID
        </div>
      )}
      {children}
    </PhantomProvider>
  );
}

// Custom hook that wraps Phantom SDK hooks for easier use
// This hook MUST be called within a component that is a child of PhantomProvider
export function usePhantomConnect() {
  const { isConnected, isLoading, user } = usePhantom();
  const accounts = useAccounts();
  const { open: openModal, close: closeModal, isOpened } = useModal();
  const { connect, isConnecting, error: connectError } = useConnect();
  const { disconnect, isDisconnecting } = useDisconnect();

  // Extract wallet addresses from accounts
  const solanaAddress =
    accounts?.find((a) => a.addressType === AddressType.solana)?.address ||
    null;
  const ethereumAddress =
    accounts?.find((a) => a.addressType === AddressType.ethereum)?.address ||
    null;

  // Use the Solana address as primary ID for Phantom Connect (phantomId)
  const userId = solanaAddress || accounts?.[0]?.address || null;

  // For Phantom Connect OAuth, email might be available in user object
  const userEmail =
    (user as any)?.email ||
    (user as any)?.profile?.email ||
    (user as any)?.user?.email ||
    null;

  return {
    // Connection state
    isAuthenticated: isConnected,
    isLoading: isLoading || isConnecting || isDisconnecting,
    user:
      isConnected && userId
        ? {
            id: userId,
            email: userEmail || undefined,
            solanaWallet: solanaAddress || undefined,
            ethereumWallet: ethereumAddress || undefined,
          }
        : null,

    // Modal controls
    openModal,
    closeModal,
    isModalOpen: isOpened,

    // Connection methods
    connect: async (provider?: "google" | "apple" | "injected") => {
      if (provider) {
        await connect({ provider });
      } else {
        // Open modal if no provider specified
        openModal();
      }
    },
    disconnect: async () => {
      await disconnect();
    },

    // Error state
    error: connectError,
  };
}


"use client";

/**
 * Log in popup. No prototype screen exists for it, so it uses the popup family shell (AcctModal)
 * and the prototype's wallet-picker list (design/js/shell.js `wallet:` view, .wc-list).
 * Providers, handlers and close behaviour are unchanged.
 */

import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { AcctModal, AcctModalHead } from "@/components/ui/modal/accountUi";

// Show Phantom login option alongside Privy (hidden for now – Privy only)
const SHOW_PHANTOM_LOGIN = true;

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when login succeeds (e.g. after Privy login). Optional. */
  onSuccess?: () => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const { login: privyLogin, ready: privyReady } = usePrivy();
  const {
    connect: phantomConnect,
    isLoading: phantomLoading,
    openModal: openPhantomModal,
  } = usePhantomConnect();
  const [isConnecting, setIsConnecting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle click outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrivyLogin = async () => {
    if (!privyReady) return;
    setIsConnecting(true);
    try {
      await privyLogin();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Privy login error:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePhantomConnect = async (
    provider?: "google" | "apple" | "injected"
  ) => {
    setIsConnecting(true);
    try {
      if (provider) {
        // Connect directly with specific provider
        await phantomConnect(provider);
      } else {
        // Open Phantom's built-in modal
        openPhantomModal();
      }
      // Don't close immediately - let Phantom modal handle the flow
      // The modal will close automatically after successful connection
    } catch (error) {
      console.error("Phantom Connect error:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const privyDisabled = !privyReady || isConnecting;
  const phantomDisabled = phantomLoading || isConnecting;

  return (
    <AcctModal labelledBy="login-title" variant="plain" modalRef={modalRef}>
      <AcctModalHead
        id="login-title"
        title="Log in"
        description="Choose how you want to sign in"
        onClose={onClose}
        lead={
          <span className="acct-logo" aria-hidden="true">
            <Image src="/images/raptorx-logo.svg" alt="" width={30} height={24} />
          </span>
        }
      />

      <div className="acct-modal__body">
        <ul className="wc-list">
          <li>
            <button
              type="button"
              className="wc-item"
              onClick={handlePrivyLogin}
              disabled={privyDisabled}
              aria-busy={isConnecting || undefined}
            >
              <Image src="/images/privy.png" alt="" width={32} height={32} />
              <span>
                <b>Privy login</b>
                <small>Continue with Privy</small>
              </span>
              {isConnecting ? (
                <span className="rx-spin" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </li>
          {SHOW_PHANTOM_LOGIN && (
            <li>
              <button
                type="button"
                className="wc-item"
                onClick={() => handlePhantomConnect("google")}
                disabled={phantomDisabled}
                aria-busy={phantomLoading || undefined}
              >
                <Image
                  src="/images/brands/phantom.webp"
                  alt=""
                  width={32}
                  height={32}
                />
                <span>
                  <b>Phantom Connect</b>
                  <small>Continue with Google</small>
                </span>
                {phantomLoading ? (
                  <span className="rx-spin" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </li>
          )}
        </ul>
      </div>

      {SHOW_PHANTOM_LOGIN && (
        <div className="acct-modal__foot">
          <button
            type="button"
            className="rx-btn rx-btn--secondary rx-btn--block"
            onClick={() => handlePhantomConnect()}
            disabled={phantomDisabled}
          >
            Or choose from all options
          </button>
        </div>
      )}
    </AcctModal>
  );
}

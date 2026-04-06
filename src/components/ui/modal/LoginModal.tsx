"use client";

import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import Image from "next/image";

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

  return (
    <>
      <div className="absolute inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          ref={modalRef}
          className="w-[340px] max-w-[90%] bg-[#0D0D0D] rounded-xl shadow-2xl border border-white/10 pointer-events-auto relative"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition text-gray-400 hover:text-white z-10"
            aria-label="Close modal"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Logo */}
          <div className="flex justify-center pt-8 pb-12">
            <Image
              src={"/images/raptorx.png"}
              alt="RaptorX Logo"
              width={80}
              height={80}
              className="w-[52px] h-[44px] sm:w-[71px] sm:h-[60px] md:w-[73px] md:h-[62px]"
            />
          </div>

          {/* Content */}
          <div className="px-6 pb-6 space-y-3 pt-4">
            <div className="space-y-3">
              <button
                onClick={handlePrivyLogin}
                disabled={!privyReady || isConnecting}
                className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 border ${
                  !privyReady || isConnecting
                    ? "border-white/10 text-gray-400 cursor-not-allowed"
                    : "border-white/20 hover:border-[#ffc000] text-white hover:text-[#ffc000]"
                }`}
              >
                <Image
                  src={"/images/privy.png"}
                  alt="Privy"
                  width={24}
                  height={24}
                  className="w-6 h-6"
                />
                <span
                  className={`font-semibold text-sm ${
                    !privyReady || isConnecting ? "text-gray-400" : ""
                  }`}
                >
                  Privy Login
                </span>
                {isConnecting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
              </button>

              {SHOW_PHANTOM_LOGIN && (
                <button
                  onClick={() => handlePhantomConnect("google")}
                  disabled={phantomLoading || isConnecting}
                  className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 border ${
                    phantomLoading || isConnecting
                      ? "border-white/10 text-gray-400 cursor-not-allowed"
                      : "border-white/20 hover:border-[#ffc000] text-white hover:text-[#ffc000]"
                  }`}
                >
                  <Image
                    src={"/images/phantom.png"}
                    alt="Phantom"
                    width={24}
                    height={24}
                    className="w-6 h-6"
                  />
                  <span
                    className={`font-semibold text-sm ${
                      phantomLoading || isConnecting ? "text-gray-400" : ""
                    }`}
                  >
                    Phantom Connect
                  </span>
                  {phantomLoading && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                </button>
              )}
            </div>

            {SHOW_PHANTOM_LOGIN && (
              <div className="pt-2 border-t-1 border-white/10">
                <button
                  onClick={() => handlePhantomConnect()}
                  disabled={phantomLoading || isConnecting}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-300 ${
                    phantomLoading || isConnecting
                      ? "text-gray-400 cursor-not-allowed"
                      : "hover:border-[#ffc000]/50 text-white/80 hover:text-white"
                  }`}
                >
                  <span className="text-xs font-medium">
                    Or choose from all options
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

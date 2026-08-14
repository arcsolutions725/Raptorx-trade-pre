"use client";

/**
 * Desktop fallback when the Phantom extension is not installed.
 * Prompts the user to install the extension so the next connect uses
 * Phantom's extension popup (RaptorX stays open).
 */
import { useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";

const PHANTOM_CHROME =
  "https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PhantomDesktopConnectModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phantom-desktop-connect-title"
        className="relative w-full max-w-[400px] rounded-2xl border border-white/10 bg-[#0D0D0D] p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex flex-col items-center gap-3 pt-2 text-center">
          <Image
            src="/images/phantom.png"
            alt="Phantom"
            width={48}
            height={48}
            className="h-12 w-12"
          />
          <h2
            id="phantom-desktop-connect-title"
            className="text-xl font-semibold text-white"
          >
            Connect Phantom
          </h2>
          <p className="text-sm text-white/65 leading-relaxed">
            Install the Phantom extension to connect with Phantom&apos;s popup
            (RaptorX stays open).
          </p>
        </div>

        {/* Extension only. A link to Phantom's mobile app used to live here, but this
            modal only ever appears on DESKTOP without the extension — and installing
            the Android/iOS app cannot connect a desktop browser session. It sent users
            to the Phantom app and left them stranded there with nothing to connect to. */}
        <div className="flex flex-col gap-3">
          <a
            href={PHANTOM_CHROME}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#AB9FF2] px-4 py-3 text-sm font-semibold text-[#1a1a1a] hover:brightness-110"
          >
            Install Phantom Extension
          </a>
        </div>
      </div>
    </div>
  );
}

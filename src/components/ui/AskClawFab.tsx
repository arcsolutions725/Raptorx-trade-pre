"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { markClawV5ScrollToInput } from "@/lib/clawV5/scrollIntent";
import "@/styles/pages/ask-claw.css";

/**
 * Floating "Ask Claw" button, bottom right (design: js/universal.js `.claw-fab .cf-btn`, shown on the
 * screener and Rex Predictions). Opens Claw AI 5.0 with the composer focused unless `onClick` is given.
 * Tablet and desktop only; pages hide it while their Rex Pilot sidebar is open.
 */
export function AskClawFab({ onClick }: { onClick?: () => void }) {
  const router = useRouter();
  const openClaw = useCallback(() => {
    markClawV5ScrollToInput();
    router.push("/claw-v5");
  }, [router]);

  return (
    <button
      type="button"
      onClick={onClick ?? openClaw}
      className="rx-ask-claw"
      aria-label="Ask Claw: open Claw AI 5.0"
    >
      <Image
        src="/images/claw-logo-96.webp"
        alt=""
        width={24}
        height={24}
        className="claw-ico"
      />
      Ask Claw
    </button>
  );
}

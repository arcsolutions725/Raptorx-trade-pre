"use client";

import { useRef, useState } from "react";
import { Leaderboard, type LeaderboardView } from "./Leaderboard";
import { AcctModal, AcctModalHead } from "@/components/ui/modal/accountUi";

interface LeaderboardModalProps {
  currentUserId?: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Leaderboard popup (reward family shell). Closes on the X or a click on the scrim, as before. */
export function LeaderboardModal({
  currentUserId,
  isOpen,
  onClose,
}: LeaderboardModalProps) {
  if (!isOpen) return null;
  return <LeaderboardDialog currentUserId={currentUserId} onClose={onClose} />;
}

/** Mounted only while open, so each opening starts on the top 3 with fresh data. */
function LeaderboardDialog({
  currentUserId,
  onClose,
}: {
  currentUserId?: string;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<LeaderboardView>("podium");

  return (
    <AcctModal
      labelledBy="lb-title"
      variant="rw"
      modalRef={modalRef}
      wide={view === "table"}
      onScrimClick={onClose}
    >
      <AcctModalHead
        id="lb-title"
        title="Leaderboard"
        description="Season leaders by points from swaps, referrals and daily missions"
        onClose={onClose}
        closeLabel="Close leaderboard"
      />
      <Leaderboard
        currentUserId={currentUserId}
        view={view}
        onViewChange={setView}
      />
    </AcctModal>
  );
}

"use client";

type ActivityProps = {
  marketSlug?: string | null;
};

export default function Activity({ marketSlug }: ActivityProps) {
  return (
    <div className="mk-msg">
      <b>No activity data</b>
      Activity for this market is not available yet.
    </div>
  );
}

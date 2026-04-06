"use client";

type ActivityProps = {
  marketSlug?: string | null;
};

export default function Activity({ marketSlug }: ActivityProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="text-sm text-white/60 mb-2">No activity data</div>
      <div className="text-xs text-white/40">Activity for this market is not available yet.</div>
    </div>
  );
}

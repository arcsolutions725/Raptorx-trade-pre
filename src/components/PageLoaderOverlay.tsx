"use client";

export default function PageLoaderOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
      <div
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/30 border-t-white"
        aria-label="Loading page"
      />
    </div>
  );
}

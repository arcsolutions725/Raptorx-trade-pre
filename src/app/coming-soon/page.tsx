"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export default function ComingSoonPage() {
  const router = useRouter();

  return (
    <div className="h-screen w-full bg-black relative overflow-hidden supports-[height:100dvh]:h-dvh">
      {/* Full Screen Video Background */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/images/trending-banner.png"
        webkit-playsinline="true"
      >
        <source src="/images/raptorX.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Dark Overlay for better text readability */}
      <div className="absolute inset-0 bg-black/50 z-10"></div>

      {/* Header */}
      <div className="absolute -top-2 left-0 right-0 w-full flex justify-between items-center px-3 sm:px-5 pt-4 sm:pt-6 pb-2 sm:pb-4 z-20">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 sm:gap-2 text-white hover:text-[#ffc000] active:text-[#ffc000] transition-colors cursor-pointer px-2.5 sm:px-3 py-2 touch-manipulation"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="text-base sm:text-lg font-medium">Back</span>
        </button>

        <div className="flex items-end">
          <Image
            src="/images/trending-logo.png"
            alt="RaptorX Logo"
            width={120}
            height={120}
            className="w-[50px] h-[50px] xs:w-[60px] xs:h-[60px] sm:w-[80px] sm:h-[80px]"
            priority
          />
        </div>
      </div>

      {/* Centered Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-5 z-15">
        <Image
          src="/images/launching.png"
          alt="Beta version"
          width={140}
          height={140}
          className="w-[364px] min-h-[67px]"
        />
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 w-full py-3 sm:py-4 px-4 sm:px-5 z-20">
        <div className="text-center">
          <p className="text-white/70 text-xs sm:text-sm drop-shadow-md">
            © 2025 RaptorX. Building the future of DeFi trading on Solana.
          </p>
        </div>
      </div>
    </div>
  );
}

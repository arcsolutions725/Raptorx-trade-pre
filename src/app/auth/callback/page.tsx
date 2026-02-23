"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import Image from "next/image";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = usePhantomConnect();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    const syncUserAndRedirect = async () => {
      if (!isAuthenticated || isLoading || !user?.id) return;

      setIsSyncing(true);
      try {
        // Create or update user in our PostgreSQL DB using phantomId
        await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phantomId: user.id,
            email: user.email,
            solanaWallet: user.solanaWallet,
            ethereumWallet: user.ethereumWallet,
          }),
        });
      } catch (err) {
        console.error("Failed to sync Phantom user:", err);
      } finally {
        setIsSyncing(false);
        setIsRedirecting(true);
        // Small delay to ensure data is committed
        setTimeout(() => {
          router.push("/");
        }, 500);
      }
    };

    syncUserAndRedirect();
  }, [
    isAuthenticated,
    isLoading,
    user?.id,
    user?.email,
    user?.solanaWallet,
    user?.ethereumWallet,
    router,
  ]);

  // Show loading state always
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src={"/images/raptorx.png"}
            alt="RaptorX Logo"
            width={80}
            height={80}
            className="w-[71px] h-[60px] sm:w-[83px] sm:h-[70px]"
          />
        </div>

        {/* Loading Spinner */}
        <div className="flex justify-center mb-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ffc000]"></div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">
            {isSyncing
              ? "Setting up your account..."
              : isRedirecting
                ? "Redirecting..."
                : "Processing authentication..."}
          </h1>
          <p className="text-white/70 text-base">
            {isSyncing
              ? "Please wait while we sync your account information"
              : isRedirecting
                ? "Taking you to the main page"
                : "Please wait while we verify your connection"}
          </p>
        </div>
      </div>
    </div>
  );
}

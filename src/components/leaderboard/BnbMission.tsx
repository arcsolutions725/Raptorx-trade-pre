"use client";

import { useState, useEffect } from "react";
import { Wallet, CheckCircle, Circle, Loader2 } from "lucide-react";
import { useBnbMission } from "@/hooks/useBnbMission";
import { getWalletModal } from "@/components/providers/WagamiProvider";
import { ethers } from "ethers";

interface BnbMissionProps {
  userId: string;
}

export function BnbMission({ userId }: BnbMissionProps) {
  const { mission, loading, connectWallet, completeSignature } =
    useBnbMission(userId);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);

  // BSC Chain ID
  const BSC_CHAIN_ID = 56;

  // Check wallet connection status
  useEffect(() => {
    const checkWalletStatus = async () => {
      const modal = getWalletModal();
      if (modal) {
        try {
          const walletProvider = modal.getWalletProvider();
          if (walletProvider) {
            const provider = new ethers.providers.Web3Provider(walletProvider);
            const signer = await provider.getSigner();
            const walletAddress = await signer.getAddress();
            const network = await provider.getNetwork();

            setAddress(walletAddress);
            setIsConnected(true);
            setChainId(Number(network.chainId));

            // If connected to BSC and wallet not yet connected in mission
            if (
              Number(network.chainId) === BSC_CHAIN_ID &&
              !mission?.walletConnected
            ) {
              await connectWallet(walletAddress);
            }
          }
        } catch {
          setAddress(null);
          setIsConnected(false);
          setChainId(null);
        }
      }
    };

    checkWalletStatus();
  }, [mission, connectWallet]);

  const handleConnectBnbWallet = async () => {
    setIsConnecting(true);
    try {
      const modal = getWalletModal();
      if (!modal) {
        throw new Error("Wallet modal not initialized");
      }

      // Open the wallet connection modal
      await modal.open();

      // Check if connected after modal interaction
      const walletProvider = modal.getWalletProvider();
      if (walletProvider) {
        const provider = new ethers.providers.Web3Provider(walletProvider);
        const signer = await provider.getSigner();
        const walletAddress = await signer.getAddress();
        const network = await provider.getNetwork();

        setAddress(walletAddress);
        setIsConnected(true);
        setChainId(Number(network.chainId));

        // If not on BSC, request network switch
        if (Number(network.chainId) !== BSC_CHAIN_ID) {
          try {
            await walletProvider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x38" }], // BSC Chain ID in hex
            });
          } catch (switchError: unknown) {
            if ((switchError as { code?: number }).code === 4902) {
              // Network not added to wallet, add it
              await walletProvider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0x38",
                    chainName: "BNB Smart Chain",
                    nativeCurrency: {
                      name: "BNB",
                      symbol: "BNB",
                      decimals: 18,
                    },
                    rpcUrls: ["https://bsc-dataseed.binance.org/"],
                    blockExplorerUrls: ["https://bscscan.com/"],
                  },
                ],
              });
            } else {
              throw switchError;
            }
          }
        }

        // Connect wallet in backend
        const result = await connectWallet(walletAddress);
        if (result.success) {
          // Success handled by UI state
        }
      }
    } catch (error) {
      console.error("Failed to connect wallet to BSC:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignMessage = async () => {
    setIsSigning(true);
    try {
      // Check if wallet is connected and on BSC
      if (!isConnected || !address) {
        throw new Error("No wallet connected");
      }

      if (chainId !== BSC_CHAIN_ID) {
        const modal = getWalletModal();
        const walletProvider = modal?.getWalletProvider();
        if (walletProvider) {
          try {
            await walletProvider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x38" }], // BSC Chain ID in hex
            });
          } catch (switchError: unknown) {
            if ((switchError as { code?: number }).code === 4902) {
              // Network not added to wallet, add it
              await walletProvider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0x38",
                    chainName: "BNB Smart Chain",
                    nativeCurrency: {
                      name: "BNB",
                      symbol: "BNB",
                      decimals: 18,
                    },
                    rpcUrls: ["https://bsc-dataseed.binance.org/"],
                    blockExplorerUrls: ["https://bscscan.com/"],
                  },
                ],
              });
            } else {
              throw switchError;
            }
          }
        }
      }

      // Sign a message using ethers
      const modal = getWalletModal();
      const walletProvider = modal?.getWalletProvider();
      if (walletProvider) {
        const provider = new ethers.providers.Web3Provider(walletProvider);
        const signer = await provider.getSigner();
        const message = `RaptorX Daily Mission - ${new Date().toDateString()}`;

        const signature = await signer.signMessage(message);

        // Complete signature in backend
        const result = await completeSignature(signature);
        if (result.success) {
          // Success message would be handled by UI state
        }
      }
    } catch (error) {
      console.error("Failed to sign message:", error);
    } finally {
      setIsSigning(false);
    }
  };

  if (loading && !mission) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-[#ffc000]" />
          <p className="ml-3 text-gray-400">Loading BNB mission...</p>
        </div>
      </div>
    );
  }

  if (!mission) return null;

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-600 p-2 rounded-lg">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-white">BNB Chain Mission</h4>
            <p className="text-xs text-gray-400">
              Connect wallet & sign to earn +250 points
            </p>
          </div>
        </div>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            mission.isCompleted
              ? "bg-green-500/20 text-green-400"
              : "bg-yellow-500/20 text-yellow-400"
          }`}
        >
          {mission.isCompleted ? "Completed!" : "Available"}
        </span>
      </div>

      <div className="space-y-3">
        {/* Step 1: Connect BNB Wallet */}
        <div className="flex items-center gap-3">
          {mission.walletConnected ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <Circle className="w-5 h-5 text-gray-500 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-white text-sm">Connect wallet to BSC</p>
            <p className="text-xs text-gray-400">
              Connect Metamask or compatible wallet to BSC network
            </p>
          </div>
          {!mission.walletConnected && (
            <button
              onClick={handleConnectBnbWallet}
              disabled={isConnecting}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-xs px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </button>
          )}
        </div>

        {/* Step 2: Complete On-Chain Signature */}
        <div className="flex items-center gap-3">
          {mission.signatureCompleted ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <Circle className="w-5 h-5 text-gray-500 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-white text-sm">Complete on-chain signature</p>
            <p className="text-xs text-gray-400">
              Sign a message with your BNB wallet
            </p>
          </div>
          {mission.walletConnected && !mission.signatureCompleted && (
            <button
              onClick={handleSignMessage}
              disabled={isSigning}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-xs px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
            >
              {isSigning ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Signing...
                </>
              ) : (
                "Sign"
              )}
            </button>
          )}
          {!mission.walletConnected && (
            <span className="text-xs text-gray-500">Connect wallet first</span>
          )}
        </div>

        {/* Reward Display */}
        {mission.isCompleted && (
          <div className="bg-green-600/20 rounded-lg p-3 border border-green-500/30">
            <div className="text-center text-green-400">
              <CheckCircle className="w-6 h-6 mx-auto mb-1" />
              <p className="font-semibold">+250 Points Earned!</p>
              <p className="text-xs opacity-80">
                BNB mission completed successfully
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-4 pt-3 border-t border-gray-700">
        <p className="text-xs text-gray-400">
          • BNB Chain only • Supports Metamask & Trust Wallet • Resets daily
        </p>
      </div>
    </div>
  );
}

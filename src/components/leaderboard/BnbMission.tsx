"use client";

import "@/styles/pages/rewards.css";
import { useState, useEffect } from "react";
import clsx from "clsx";
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
      <div className="bnb-mission rx-flat" role="status">
        <div className="bnb-mission__head">
          <span className="dm-card__ico">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          </span>
          <div className="dm-card__t">
            <span className="dm-card__m">Loading BNB mission…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!mission) return null;

  const steps = [
    {
      key: "connect",
      title: "Connect wallet to BSC",
      text: "Connect Metamask or compatible wallet to BSC network",
      done: mission.walletConnected,
    },
    {
      key: "sign",
      title: "Complete on-chain signature",
      text: "Sign a message with your BNB wallet",
      done: mission.signatureCompleted,
    },
  ];

  return (
    <div
      className={clsx("bnb-mission rx-flat", mission.isCompleted && "is-done")}
    >
      <div className="bnb-mission__head">
        <span className="dm-card__ico">
          <Wallet className="size-5" aria-hidden="true" />
        </span>
        <div className="dm-card__t">
          <b>BNB Chain mission</b>
          <span className="dm-card__m">
            Connect wallet &amp; sign to earn <b>+250</b> pts
          </span>
        </div>
        <span
          className={clsx(
            "rx-badge",
            mission.isCompleted ? "rx-badge--up" : "rx-badge--gold",
          )}
        >
          {mission.isCompleted ? "Completed" : "Available"}
        </span>
      </div>

      <ol className="bnb-mission__steps">
        {steps.map((step) => (
          <li key={step.key} className={clsx(step.done && "is-done")}>
            {step.done ? (
              <CheckCircle className="size-5 shrink-0 text-rx-up" aria-hidden="true" />
            ) : (
              <Circle className="size-5 shrink-0 text-rx-text-3" aria-hidden="true" />
            )}
            <span className="bnb-mission__t">
              <b>{step.title}</b>
              <span>{step.text}</span>
            </span>
            {step.key === "connect" && !mission.walletConnected && (
              <button
                type="button"
                onClick={handleConnectBnbWallet}
                disabled={isConnecting}
                aria-busy={isConnecting || undefined}
                className="rx-btn rx-btn--report rx-btn--s"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    Connecting…
                  </>
                ) : (
                  "Connect"
                )}
              </button>
            )}
            {step.key === "sign" &&
              mission.walletConnected &&
              !mission.signatureCompleted && (
                <button
                  type="button"
                  onClick={handleSignMessage}
                  disabled={isSigning}
                  aria-busy={isSigning || undefined}
                  className="rx-btn rx-btn--report rx-btn--s"
                >
                  {isSigning ? (
                    <>
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      Signing…
                    </>
                  ) : (
                    "Sign"
                  )}
                </button>
              )}
            {step.key === "sign" && !mission.walletConnected && (
              <span className="rx-help">Connect wallet first</span>
            )}
          </li>
        ))}
      </ol>

      {mission.isCompleted && (
        <div className="acct-alert acct-alert--up" role="status">
          <CheckCircle className="size-4" aria-hidden="true" />
          <p>
            <b>+250 points earned!</b> BNB mission completed successfully.
          </p>
        </div>
      )}

      <p className="rx-help bnb-mission__foot">
        BNB Chain only · Supports Metamask &amp; Trust Wallet · Resets daily
      </p>
    </div>
  );
}

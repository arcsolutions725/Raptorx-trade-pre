import { useCallback } from "react";
import { ClobClient } from "@polymarket/clob-client";
import { useWallet } from "@/contexts/WalletContext";
import { CLOB_API_URL, POLYGON_CHAIN_ID } from "@/constants/polymarket";

export interface UserApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

// This hook's sole purpose is to derive or create
// the User API Credentials with a temporary ClobClient

export default function useUserApiCredentials() {
  const { eoaAddress, ethersSigner } = useWallet();

  // Creates temporary clobClient with ethers signer
  const createOrDeriveUserApiCredentials =
    useCallback(async (): Promise<UserApiCredentials> => {
      if (!eoaAddress || !ethersSigner) {
        throw new Error("Wallet not connected");
      }

      // Verify signer is properly configured
      let signerAddress: string;
      try {
        signerAddress = await ethersSigner.getAddress();
        if (signerAddress.toLowerCase() !== eoaAddress.toLowerCase()) {
          throw new Error(
            `Signer address mismatch: ${signerAddress} !== ${eoaAddress}`
          );
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[useUserApiCredentials] Failed to get signer address:", err);
        }
        throw new Error("Signer is not properly configured");
      }

      // Verify signer supports EIP-712 signing (required for L1 auth)
      if (typeof (ethersSigner as any)._signTypedData !== "function") {
        throw new Error(
          "Signer does not support EIP-712 signing (_signTypedData). " +
          "This is required for L1 authentication. Please ensure you're using a compatible wallet."
        );
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[useUserApiCredentials] Creating ClobClient for L1 authentication",
          {
            address: eoaAddress,
            host: CLOB_API_URL,
            chainId: POLYGON_CHAIN_ID,
          }
        );
      }

      // Create ClobClient with signer for L1 authentication
      // The ClobClient will automatically generate L1 auth headers (POLY_ADDRESS, POLY_SIGNATURE, etc.)
      // when calling deriveApiKey() or createApiKey()
      // Using server time to avoid timestamp synchronization issues
      const tempClient = new ClobClient(
        CLOB_API_URL,
        POLYGON_CHAIN_ID,
        ethersSigner,
        undefined, // creds - not needed for L1 auth
        undefined, // signatureType - not needed for L1 auth
        undefined, // funderAddress - not needed for L1 auth
        undefined, // geoBlockToken - optional
        true // useServerTime - use server time to avoid timestamp issues
      );

      try {
        if (process.env.NODE_ENV !== "production") {
          console.log("[useUserApiCredentials] Attempting to derive API key...");
        }
        // Try to derive existing credentials first (uses nonce 0 by default)
        const derivedCreds = await tempClient.deriveApiKey().catch((err) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[useUserApiCredentials] Failed to derive API key:",
              err?.message || err
            );
          }
          return null;
        });

        if (
          derivedCreds?.key &&
          derivedCreds?.secret &&
          derivedCreds?.passphrase
        ) {
          if (process.env.NODE_ENV !== "production") {
            console.log(
              "[useUserApiCredentials] Successfully derived existing API credentials"
            );
          }
          return derivedCreds;
        }

        // Derive failed or returned invalid data - create new credentials
        if (process.env.NODE_ENV !== "production") {
          console.log("[useUserApiCredentials] Creating new API key...");
        }
        const newCreds = await tempClient.createApiKey();
        if (process.env.NODE_ENV !== "production") {
          console.log(
            "[useUserApiCredentials] Successfully created new API credentials"
          );
        }
        return newCreds;
      } catch (err: any) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[useUserApiCredentials] Failed to get credentials:", err);
        }
        
        // Provide more detailed error information
        if (err?.message?.includes("Invalid L1 Request headers")) {
          throw new Error(
            `L1 authentication failed. The ClobClient could not generate valid L1 auth headers. ` +
            `Please ensure your wallet is connected and can sign EIP-712 messages. ` +
            `Error: ${err.message}`
          );
        }
        
        if (err?.message?.includes("Signer is needed")) {
          throw new Error(
            `L1 authentication failed. Signer is not available. Please ensure your wallet is connected.`
          );
        }
        
        throw err;
      }
    }, [eoaAddress, ethersSigner]);

  return { createOrDeriveUserApiCredentials };
}

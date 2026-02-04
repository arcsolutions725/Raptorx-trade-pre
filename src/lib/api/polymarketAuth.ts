/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";

/**
 * Get Polymarket API credentials from environment variables
 */
export function getPolymarketCredentials() {
  const apiKey = process.env.POLYMARKET_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET;
  const apiPassphrase = process.env.POLYMARKET_API_PASS_PHARSE || process.env.POLYMARKET_API_PASS_PHARSE;

  if (!apiKey) {
    throw new Error("POLYMARKET_API_KEY is not set in environment variables");
  }

  return {
    apiKey,
    apiSecret: apiSecret || "",
    apiPassphrase: apiPassphrase || "",
  };
}

/**
 * Create authenticated headers for Polymarket CLOB API requests
 * Polymarket CLOB API uses API key authentication with optional signature
 */
export function createPolymarketHeaders(
  method: string = "GET",
  path: string = "",
  body: string = ""
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const { apiKey, apiSecret, apiPassphrase } = getPolymarketCredentials();

    // Add API key header (required)
    headers["X-API-Key"] = apiKey;

    // If secret and passphrase are provided, create a signature
    // Note: Polymarket CLOB API may use different auth methods
    // This is a common pattern for signed requests
    if (apiSecret && apiPassphrase) {
      const timestamp = Date.now().toString();
      const message = `${timestamp}${method}${path}${body}`;
      
      // Create HMAC signature
      const signature = crypto
        .createHmac("sha256", apiSecret)
        .update(message)
        .digest("hex");

      headers["X-Timestamp"] = timestamp;
      headers["X-Signature"] = signature;
      headers["X-Passphrase"] = apiPassphrase;
    }
  } catch (error) {
    // If credentials are missing, still try with just API key
    const apiKey = process.env.POLYMARKET_API_KEY;
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }
  }

  return headers;
}

/**
 * Simple authenticated headers - just API key (most common for read-only endpoints)
 */
export function createSimplePolymarketHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const { apiKey } = getPolymarketCredentials();
    headers["X-API-Key"] = apiKey;
  } catch (error) {
    // If API key is missing, return empty headers (will fail with proper error)
    console.error("Failed to get Polymarket API key:", error);
  }

  return headers;
}


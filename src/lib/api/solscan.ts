/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";

const SOLSCAN_BASE = "https://public-api.solscan.io";

// -------------------- Types --------------------

export interface SolscanToken {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenIcon?: string;
  decimals: number;
  holder: number;
  supply: string;
}

export interface SolscanHolder {
  address: string;
  amount: number;
  decimals: number;
  owner: string;
  rank: number;
}

export interface SolscanTransfer {
  signature: string;
  blockTime: number;
  src: string;
  dst: string;
  amount: number;
  decimals: number;
  tokenAddress: string;
}

export interface SolscanData {
  token: SolscanToken;
  holders: { total: number; data: SolscanHolder[] };
  transfers: { total: number; data: SolscanTransfer[] };
}

// -------------------- Main Function --------------------

export async function getSolscanData(
  contractAddress: string
): Promise<SolscanData> {
  if (!contractAddress) throw new Error("Contract address is required");

  const apiKey = process.env.SOLSCAN_API_KEY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["token"] = apiKey;

  try {
    // Fetch token metadata, holders, and transfers in parallel
    const [tokenRes, holderRes, transferRes] = await Promise.all([
      axios.get(`${SOLSCAN_BASE}/token/meta?tokenAddress=${contractAddress}`, {
        headers,
      }),
      axios.get(
        `${SOLSCAN_BASE}/token/holders?tokenAddress=${contractAddress}&offset=0&limit=50`,
        { headers }
      ),
      axios.get(
        `${SOLSCAN_BASE}/token/transfer?tokenAddress=${contractAddress}&offset=0&limit=50`,
        { headers }
      ),
    ]);

    return {
      token: tokenRes.data,
      holders: holderRes.data,
      transfers: transferRes.data,
    };
  } catch (err: any) {
    console.error("Solscan API error:", err.response?.data || err.message);
    throw new Error("Failed to fetch Solscan data");
  }
}

// -------------------- Analysis Functions --------------------

export function analyzeHolderDistribution(holders: SolscanHolder[]) {
  if (!holders || holders.length === 0) return null;

  const totalHolders = holders.length;
  const whales = holders.filter((h) => h.amount > 1e14).length; // > 100K tokens
  const dolphins = holders.filter(
    (h) => h.amount >= 1e13 && h.amount <= 1e14
  ).length; // 10K-100K tokens
  const fish = totalHolders - whales - dolphins;

  return {
    whales: { count: whales, percentage: (whales / totalHolders) * 100 },
    dolphins: { count: dolphins, percentage: (dolphins / totalHolders) * 100 },
    fish: { count: fish, percentage: (fish / totalHolders) * 100 },
  };
}

export function analyzeTransferActivity(transfers: SolscanTransfer[]) {
  if (!transfers || transfers.length === 0) return null;

  const now = Math.floor(Date.now() / 1000);
  const last24h = transfers.filter((t) => now - t.blockTime < 86400).length;
  const last7d = transfers.filter((t) => now - t.blockTime < 604800).length;
  const totalVolume = transfers.reduce((sum, t) => sum + t.amount, 0);
  const avgTransferSize = totalVolume / transfers.length;

  return {
    transfers24h: last24h,
    transfers7d: last7d,
    totalVolume,
    avgTransferSize,
    activityTrend: last24h > last7d / 7 ? "increasing" : "decreasing",
  };
}

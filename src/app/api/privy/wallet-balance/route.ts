import { NextRequest, NextResponse } from "next/server";

const PRIVY_API = "https://api.privy.io";

type BalanceEntry = {
  chain: string;
  asset: string;
  raw_value: string;
  raw_value_decimals: number;
  display_values?: Record<string, string>;
};

type PrivyBalanceResponse = { balances: BalanceEntry[] };

/**
 * GET /api/privy/wallet-balance?user_id=<privy-user-id>
 *
 * Fetches SOL balance for the user's Privy Solana wallet via Privy API.
 * Requires PRIVY_APP_SECRET and NEXT_PUBLIC_PRIVY_APP_ID.
 *
 * @see https://docs.privy.io/api-reference/wallets/get-balance
 * @see https://docs.privy.io/api-reference/wallets/get-all
 */
export async function GET(request: NextRequest) {
  try {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "Privy app credentials not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "user_id query parameter is required" },
        { status: 400 }
      );
    }

    const encoded = Buffer.from(`${appId}:${appSecret}`).toString("base64");
    const headers: Record<string, string> = {
      "privy-app-id": appId,
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
    };

    const walletsRes = await fetch(
      `${PRIVY_API}/v1/wallets?user_id=${encodeURIComponent(userId)}&chain_type=solana`,
      { headers, cache: "no-store" }
    );
    if (!walletsRes.ok) {
      const errText = await walletsRes.text();
      console.error("Privy wallets API error:", walletsRes.status, errText);
      return NextResponse.json(
        { error: `Privy wallets API error: ${walletsRes.status}` },
        { status: walletsRes.status >= 500 ? 502 : 400 }
      );
    }

    const walletsData = (await walletsRes.json()) as {
      data?: { id: string; address: string; chain_type: string }[];
      next_cursor?: string;
    };
    const wallets = walletsData.data ?? [];
    const solanaWallet = wallets.find((w) => w.chain_type === "solana");
    if (!solanaWallet) {
      return NextResponse.json({
        lamports: 0,
        sol: 0,
        formatted: "0.0000",
      });
    }

    const balanceRes = await fetch(
      `${PRIVY_API}/v1/wallets/${solanaWallet.id}/balance?asset=sol&chain=solana`,
      { headers, cache: "no-store" }
    );
    if (!balanceRes.ok) {
      const errText = await balanceRes.text();
      console.error("Privy balance API error:", balanceRes.status, errText);
      return NextResponse.json(
        { error: `Privy balance API error: ${balanceRes.status}` },
        { status: balanceRes.status >= 500 ? 502 : 400 }
      );
    }

    const balanceBody = (await balanceRes.json()) as PrivyBalanceResponse;
    const balances = balanceBody.balances ?? [];
    const solEntry = balances.find(
      (b) => b.chain === "solana" && b.asset === "sol"
    );
    const lamports = solEntry
      ? Number.parseInt(solEntry.raw_value, 10) || 0
      : 0;
    const sol = lamports / 1e9;
    const formatted = sol.toFixed(4);

    return NextResponse.json({
      lamports,
      sol,
      formatted,
    });
  } catch (e) {
    console.error("Privy wallet-balance error:", e);
    return NextResponse.json(
      { error: "Failed to fetch Privy wallet balance" },
      { status: 500 }
    );
  }
}

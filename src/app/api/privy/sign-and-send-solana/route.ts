import { NextRequest, NextResponse } from "next/server";

const PRIVY_API = "https://api.privy.io";

const SOLANA_CAIP2 = {
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  testnet: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
} as const;

/**
 * POST /api/privy/sign-and-send-solana
 *
 * Signs and sends a Solana transaction using the user's Privy Solana wallet.
 * Body: { user_id: string, transaction: string (base64), chain?: "mainnet" | "devnet" | "testnet" }
 * Returns: { signature: string } (Solana transaction signature/hash)
 *
 * @see https://docs.privy.io/api-reference/wallets/solana/sign-and-send-transaction
 * @see https://docs.privy.io/api-reference/wallets/get-all
 */
export async function POST(request: NextRequest) {
  try {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "Privy app credentials not configured" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.user_id === "string" ? body.user_id : null;
    const transaction =
      typeof body?.transaction === "string" ? body.transaction : null;
    const chain: keyof typeof SOLANA_CAIP2 =
      body?.chain === "devnet" || body?.chain === "testnet"
        ? (body.chain as "devnet" | "testnet")
        : "mainnet";

    if (!userId || !transaction) {
      return NextResponse.json(
        { error: "user_id and transaction (base64) are required" },
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
        { error: `Privy wallets error: ${walletsRes.status}` },
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
      return NextResponse.json(
        { error: "No Solana wallet found for this user" },
        { status: 400 }
      );
    }

    const caip2 = SOLANA_CAIP2[chain];
    const rpcRes = await fetch(
      `${PRIVY_API}/v1/wallets/${solanaWallet.id}/rpc`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          method: "signAndSendTransaction",
          caip2,
          params: {
            transaction,
            encoding: "base64",
          },
        }),
      }
    );

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error("Privy signAndSendTransaction error:", rpcRes.status, errText);
      let message = `Privy sign/send failed: ${rpcRes.status}`;
      try {
        const errJson = JSON.parse(errText) as { message?: string; error?: string };
        message = errJson.message ?? errJson.error ?? message;
      } catch {
        // use default message
      }
      return NextResponse.json(
        { error: message },
        { status: rpcRes.status >= 500 ? 502 : 400 }
      );
    }

    const rpcData = (await rpcRes.json()) as {
      method?: string;
      data?: { hash?: string; caip2?: string; transaction_id?: string };
    };
    const signature = rpcData?.data?.hash;
    if (!signature || typeof signature !== "string") {
      return NextResponse.json(
        { error: "No transaction hash in Privy response" },
        { status: 502 }
      );
    }

    return NextResponse.json({ signature });
  } catch (e) {
    console.error("Privy sign-and-send-solana error:", e);
    return NextResponse.json(
      { error: "Failed to sign and send transaction" },
      { status: 500 }
    );
  }
}

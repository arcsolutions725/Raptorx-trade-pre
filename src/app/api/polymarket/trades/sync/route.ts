/**
 * POST /api/polymarket/trades/sync
 *
 * Syncs Polymarket trades from the client (useTrades data) into our DB for dashboard volume:
 * total volume, volume per week, and per-user volume (address + volume). Matches users by ethereumWallet for Privy metrics.
 *
 * Body: { walletAddress: string, trades: Array<{ id, maker_address?, taker_address?, size, price, match_time }> }
 * Headers: x-user-id (optional, RaptorX user cuid) to link trades to user.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normalizeAddress(addr: string | undefined): string {
  return (addr ?? "").toLowerCase().trim();
}

export async function POST(request: NextRequest) {
  try {
    const userIdHeader = request.headers.get("x-user-id") ?? undefined;
    const body = await request.json().catch(() => ({}));
    const walletAddress =
      typeof body?.walletAddress === "string" ? body.walletAddress.trim() : "";
    const rawTrades = Array.isArray(body?.trades) ? body.trades : [];

    if (!walletAddress) {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    const wallet = normalizeAddress(walletAddress);

    // Resolve userId: prefer header, else lookup by ethereumWallet (Privy/Phantom)
    let userId: string | null = userIdHeader || null;
    if (!userId && wallet) {
      const user = await prisma.user.findFirst({
        where: {
          ethereumWallet: { equals: wallet, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (user) userId = user.id;
    }

    const toUpsert: Array<{
      polymarketTradeId: string;
      walletAddress: string;
      userId: string | null;
      volumeUsd: number;
      tradedAt: Date;
    }> = [];

    for (const t of rawTrades) {
      const id =
        t.id !== undefined && t.id !== null ? String(t.id) : undefined;
      const maker = normalizeAddress(
        t.maker_address ?? t.maker ?? t.makerAddress
      );
      const taker = normalizeAddress(
        t.taker_address ?? t.taker ?? t.takerAddress
      );
      if (!id || (!maker && !taker)) continue;
      const isParticipant =
        maker === wallet || taker === wallet;
      if (!isParticipant) continue;

      const size = parseFloat(t.size);
      const price = parseFloat(t.price);
      if (Number.isNaN(size) || Number.isNaN(price) || size < 0 || price < 0)
        continue;

      let tradedAt: Date;
      const mt = t.match_time ?? t.matchTime ?? t.timestamp;
      if (typeof mt === "number") {
        tradedAt = mt > 1e12 ? new Date(mt) : new Date(mt * 1000);
      } else if (typeof mt === "string") {
        tradedAt = new Date(mt);
      } else {
        tradedAt = new Date();
      }
      if (Number.isNaN(tradedAt.getTime())) continue;

      const volumeUsd = size * price;
      toUpsert.push({
        polymarketTradeId: id,
        walletAddress: wallet,
        userId,
        volumeUsd,
        tradedAt,
      });
    }

    if (toUpsert.length === 0) {
      return NextResponse.json({ synced: 0, created: 0, updated: 0 });
    }

    let created = 0;
    let updated = 0;
    for (const row of toUpsert) {
      const existing = await prisma.polymarketTrade.findUnique({
        where: { polymarketTradeId: row.polymarketTradeId },
        select: { id: true },
      });
      if (existing) {
        await prisma.polymarketTrade.update({
          where: { polymarketTradeId: row.polymarketTradeId },
          data: {
            userId: row.userId,
            volumeUsd: row.volumeUsd,
            tradedAt: row.tradedAt,
          },
        });
        updated++;
      } else {
        await prisma.polymarketTrade.create({
          data: {
            polymarketTradeId: row.polymarketTradeId,
            walletAddress: row.walletAddress,
            userId: row.userId,
            volumeUsd: row.volumeUsd,
            tradedAt: row.tradedAt,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      synced: toUpsert.length,
      created,
      updated,
    });
  } catch (err) {
    console.error("Polymarket trades sync error:", err);
    return NextResponse.json(
      { error: "Failed to sync trades" },
      { status: 500 }
    );
  }
}

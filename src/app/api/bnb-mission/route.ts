/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

export type BnbMissionStatus = {
  walletConnected: boolean;
  signatureCompleted: boolean;
  isCompleted: boolean;
  pointsEarned: number;
  pointsAvailable: number;
  lastCompletionDate: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const userId = requireUserId(request);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        bnbWalletConnected: true,
        bnbSignatureCompleted: true,
        bnbMissionCompleted: true,
        lastBnbMissionDate: true,
        points: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if we need to reset BNB mission for the day
    const lastMissionDate = user.lastBnbMissionDate;
    const isNewDay = !lastMissionDate || lastMissionDate < today;

    let walletConnected = user.bnbWalletConnected;
    let signatureCompleted = user.bnbSignatureCompleted;
    let missionCompleted = user.bnbMissionCompleted;

    // Reset mission status if it's a new day
    if (isNewDay) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          bnbWalletConnected: false,
          bnbSignatureCompleted: false,
          bnbMissionCompleted: false,
        },
      });

      walletConnected = false;
      signatureCompleted = false;
      missionCompleted = false;
    }

    const isCompleted = walletConnected && signatureCompleted;
    const pointsEarned = isCompleted ? 250 : 0;
    const pointsAvailable = 250;

    const missionStatus: BnbMissionStatus = {
      walletConnected,
      signatureCompleted,
      isCompleted,
      pointsEarned,
      pointsAvailable,
      lastCompletionDate: missionCompleted ? today.toISOString() : null,
    };

    return NextResponse.json({
      success: true,
      mission: missionStatus,
      user: {
        totalPoints: user.points,
      },
    });
  } catch (error: any) {
    console.error("BNB mission API error:", error);
    const msg = error?.message || "Unknown error";
    const status = msg.includes("x-user-id") ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to fetch BNB mission", details: msg },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const body = await request.json();
    const { action, walletAddress, signature } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing action parameter" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        bnbWalletConnected: true,
        bnbSignatureCompleted: true,
        bnbMissionCompleted: true,
        lastBnbMissionDate: true,
        points: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if mission was already completed today
    const lastMissionDate = user.lastBnbMissionDate;
    const isNewDay = !lastMissionDate || lastMissionDate < today;

    if (!isNewDay && user.bnbMissionCompleted) {
      return NextResponse.json(
        { error: "BNB mission already completed today" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    let pointsToAdd = 0;

    if (action === "connect_wallet") {
      if (!walletAddress) {
        return NextResponse.json(
          { error: "Missing wallet address" },
          { status: 400 }
        );
      }

      // Validate that it's a valid Ethereum/BSC wallet address (basic validation)
      if (!walletAddress.startsWith("0x") || walletAddress.length !== 42) {
        return NextResponse.json(
          { error: "Invalid wallet address format" },
          { status: 400 }
        );
      }

      updateData.bnbWalletConnected = true;
      updateData.lastBnbMissionDate = today;
    } else if (action === "complete_signature") {
      if (!signature) {
        return NextResponse.json(
          { error: "Missing signature" },
          { status: 400 }
        );
      }

      // In a real implementation, you would verify the signature
      // For now, we'll just check that it's provided and looks like a signature
      if (!signature.startsWith("0x") || signature.length < 130) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 400 }
        );
      }

      updateData.bnbSignatureCompleted = true;
      updateData.lastBnbMissionDate = today;

      // Check if wallet is already connected
      if (
        user.bnbWalletConnected ||
        (isNewDay && updateData.bnbWalletConnected)
      ) {
        updateData.bnbMissionCompleted = true;
        pointsToAdd = 250;
        updateData.points = { increment: pointsToAdd };
      }
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      action,
      pointsEarned: pointsToAdd,
      missionCompleted: updateData.bnbMissionCompleted || false,
      user: {
        totalPoints: updatedUser.points,
      },
    });
  } catch (error: any) {
    console.error("BNB mission POST error:", error);
    const msg = error?.message || "Unknown error";
    const status = msg.includes("x-user-id") ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to update BNB mission", details: msg },
      { status }
    );
  }
}

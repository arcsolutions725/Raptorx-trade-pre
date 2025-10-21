/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import { Prisma } from "@prisma/client";

/* ----------------------------- Helpers ----------------------------- */

function generateUsername(): string {
  const animals = [
    "Doggy",
    "Lion",
    "Tiger",
    "Bear",
    "Wolf",
    "Fox",
    "Eagle",
    "Shark",
    "Panda",
    "Koala",
    "Zebra",
    "Giraffe",
    "Rhino",
    "Hippo",
    "Falcon",
    "Hawk",
    "Raven",
    "Phoenix",
    "Dragon",
    "Unicorn",
    "Pegasus",
    "Griffin",
  ];
  const a = animals[Math.floor(Math.random() * animals.length)];
  const n = Math.floor(Math.random() * 9999) + 1;
  return `${a}${n}`;
}

async function generateUniqueUsername(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = generateUsername();
    const exists = await prisma.user.findUnique({
      where: { username: candidate },
    });
    if (!exists) return candidate;
  }
  return `User${Date.now()}`;
}

async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const exists = await prisma.user.findUnique({
      where: { referralCode: code },
    });
    if (!exists) return code;
  }
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Atomically attach referrer ONCE and award bonuses ONCE.
 * Returns true if we won and awarded, false if already attached/invalid.
 */
async function attachReferralOnce(
  newUserId: string,
  newUserPrivyId: string,
  referralCode: string
): Promise<boolean> {
  const REFERRER_BONUS = 150;
  const EXTRA_SIGNUP_POINTS = 50; // 50 → 100

  // Look up referrer outside tx (keeps tx tiny)
  const referrer = await prisma.user.findUnique({
    where: { referralCode },
    select: { id: true, privyId: true },
  });
  if (!referrer) return false;
  if (referrer.privyId === newUserPrivyId) return false; // self-referral guard

  try {
    const awarded = await prisma.$transaction(
      async (tx) => {
        // Guard: only set referredBy if still null
        const setRef = await tx.user.updateMany({
          where: { id: newUserId, referredBy: null },
          data: { referredBy: referrer.id },
        });

        if (setRef.count !== 1) return false;

        await tx.user.update({
          where: { id: referrer.id },
          data: { points: { increment: REFERRER_BONUS } },
        });

        await tx.user.update({
          where: { id: newUserId },
          data: { points: { increment: EXTRA_SIGNUP_POINTS } },
        });

        return true;
      },
      { timeout: 10_000, maxWait: 5_000, isolationLevel: "ReadCommitted" }
    );
    return awarded;
  } catch (err) {
    console.error("attachReferralOnce() tx error:", err);
    return false;
  }
}

/* ------------------------------ POST ------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const privyId: string | undefined = body?.privyId;

    // Normalize email ONCE (treat "" as null)
    const normalizedEmail: string | null =
      typeof body?.email === "string" && body.email.trim() !== ""
        ? body.email.trim()
        : null;

    // Normalize referral code once
    const referralCode: string | undefined =
      typeof body?.referralCode === "string" && body.referralCode.trim() !== ""
        ? body.referralCode.trim()
        : undefined;

    if (!privyId) {
      return NextResponse.json(
        { error: "privyId is required" },
        { status: 400 }
      );
    }

    // Fast path: user exists
    let existing = await prisma.user.findUnique({ where: { privyId } });
    if (existing) {
      // If referral provided and not yet set, try to attach exactly once
      if (referralCode && !existing.referredBy) {
        await attachReferralOnce(existing.id, privyId, referralCode);
        existing = await prisma.user.findUnique({ where: { privyId } });
        if (!existing) {
          return NextResponse.json(
            { error: "User disappeared after update" },
            { status: 500 }
          );
        }
      }

      // Update daily counters; set email if newly provided or changed
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isNewDay =
        !existing.lastLoginDate || existing.lastLoginDate < today;

      const needsEmailUpdate =
        normalizedEmail !== null && normalizedEmail !== existing.email;

      if (needsEmailUpdate) {
        console.log(
          `Updating email for privyId=${privyId} → ${normalizedEmail}`
        );
      }

      let updated;
      try {
        updated = await prisma.user.update({
          where: { privyId },
          data: {
            lastLoginDate: new Date(),
            ...(isNewDay && { reportsToday: 0, queriesToday: 0 }),
            ...(needsEmailUpdate ? { email: normalizedEmail } : {}),
          },
        });
      } catch (err: any) {
        // Handle potential unique constraint on email
        if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
          console.warn("Email unique constraint hit while updating user.");
          return NextResponse.json(
            { error: "This email is already in use." },
            { status: 409 }
          );
        }
        throw err;
      }

      const isAdmin = isAdminEmail(updated.email);
      return NextResponse.json({
        user: updated,
        isNewUser: false,
        isAdmin,
        message: "Welcome back!",
      });
    }

    // Create new user (idempotent; recover on P2002)
    const username = await generateUniqueUsername();
    const userReferralCode = await generateUniqueReferralCode();
    const BASE_SIGNUP_POINTS = 50;

    try {
      existing = await prisma.user.create({
        data: {
          privyId,
          username,
          email: normalizedEmail, // <-- write email on create (null if not provided)
          points: BASE_SIGNUP_POINTS,
          referralCode: userReferralCode,
          lastLoginDate: new Date(),
        },
      });
      console.log("User created successfully:", existing.id);
    } catch (err) {
      const isP2002 =
        (err as Prisma.PrismaClientKnownRequestError)?.code === "P2002";
      if (!isP2002) {
        console.error("Error creating user:", err);
        throw err;
      }
      console.warn(
        "Concurrent create detected (P2002). Loading existing user."
      );
      existing = await prisma.user.findUnique({ where: { privyId } });
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Failed to create or load user after concurrency race" },
        { status: 500 }
      );
    }

    // Try to attach referral ONCE (if provided and valid)
    let message = "New user created with 50 points!";
    if (referralCode) {
      const awarded = await attachReferralOnce(
        existing.id,
        privyId,
        referralCode
      );
      if (awarded)
        message = "New user created with 100 points (referral bonus)!";
    }

    // Return freshest snapshot
    const fresh = await prisma.user.findUnique({ where: { privyId } });
    if (!fresh) {
      return NextResponse.json(
        { error: "User not found after creation" },
        { status: 500 }
      );
    }

    const isAdmin = isAdminEmail(fresh.email);
    return NextResponse.json({
      user: fresh,
      isNewUser: true,
      isAdmin,
      message,
    });
  } catch (error) {
    console.error("User POST API error:", error);
    return NextResponse.json(
      { error: "Failed to process user data" },
      { status: 500 }
    );
  }
}

/* ------------------------------- GET ------------------------------- */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const privyId = searchParams.get("privyId");
    if (!privyId) {
      return NextResponse.json(
        { error: "PrivyId is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { privyId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAdmin = isAdminEmail(user.email);
    return NextResponse.json({ user, isAdmin });
  } catch (error) {
    console.error("User GET API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/isAdmin";

// Generate random username
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const privyId: string | undefined = body?.privyId;
    const emailFromClient: string | undefined = body?.email; // optional
    const referralCode: string | undefined = body?.referralCode; // referral code for new users

    // Debug logging
    console.log("=== USER API DEBUG ===");
    console.log("Request body:", body);
    console.log("privyId:", privyId);
    console.log("emailFromClient:", emailFromClient);
    console.log("referralCode:", referralCode);
    console.log("referralCode type:", typeof referralCode);
    console.log("======================");

    if (!privyId) {
      return NextResponse.json(
        { error: "privyId is required" },
        { status: 400 }
      );
    }

    let user = await prisma.user.findUnique({ where: { privyId } });
    let isNewUser = false;

    console.log("Found existing user:", !!user);
    console.log("User ID if exists:", user?.id);

    if (!user) {
      console.log("Creating new user...");
      isNewUser = true;
      let username = generateUsername();
      while (await prisma.user.findUnique({ where: { username } })) {
        username = generateUsername();
      }

      // Generate unique referral code for new user
      let userReferralCode = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
      while (
        await prisma.user.findUnique({
          where: { referralCode: userReferralCode },
        })
      ) {
        userReferralCode = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
      }

      // Handle referral logic
      let referrerId: string | undefined;
      let signupPoints = 50; // Default points for direct signup (no referral)
      let referralMessage = "New user created with 50 points!";

      if (referralCode && referralCode.trim() !== "") {
        console.log("Processing referral code:", referralCode);
        // Find the referring user
        const referrer = await prisma.user.findUnique({
          where: { referralCode: referralCode.trim() },
        });

        console.log("Found referrer:", referrer?.username);

        if (referrer && referrer.privyId !== privyId) {
          // Prevent self-referral
          referrerId = referrer.id;
          signupPoints = 100; // Referred users get 100 points
          referralMessage =
            "New user created with 100 points (referral bonus)!";

          console.log("Awarding bonus to referrer:", referrer.username);
          // Award 150 bonus points to referrer
          await prisma.user.update({
            where: { id: referrer.id },
            data: {
              points: { increment: 150 }, // Referrer gets 150 MORE points
            },
          });
        }
      }

      console.log("About to create user with data:", {
        privyId,
        username,
        email: emailFromClient || null,
        points: signupPoints,
        referralCode: userReferralCode,
        referredBy: referrerId,
      });

      try {
        user = await prisma.user.create({
          data: {
            privyId,
            username,
            email: emailFromClient || null,
            points: signupPoints,
            referralCode: userReferralCode,
            referredBy: referrerId,
            lastLoginDate: new Date(),
          },
        });

        console.log("User created successfully:", user.id);
      } catch (createError) {
        console.error("Error creating user:", createError);

        // If it's a unique constraint error, the user might have been created by another request
        // Let's try to find them again
        const existingUser = await prisma.user.findUnique({
          where: { privyId },
        });
        if (existingUser) {
          console.log(
            "Found user that was created concurrently:",
            existingUser.id
          );
          user = existingUser;
          isNewUser = false; // It's actually not a new user anymore
        } else {
          throw createError; // Re-throw if it's not a race condition
        }
      }

      const isAdmin = isAdminEmail(user.email);

      return NextResponse.json({
        user,
        isNewUser,
        isAdmin,
        message: isNewUser ? referralMessage : "Welcome back!",
      });
    } else {
      // Update last login date and reset daily counters if it's a new day
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const lastLogin = user.lastLoginDate;
      const isNewDay = !lastLogin || lastLogin < today;

      user = await prisma.user.update({
        where: { privyId },
        data: {
          lastLoginDate: new Date(),
          ...(isNewDay && {
            reportsToday: 0,
            queriesToday: 0,
          }),
          ...(emailFromClient && emailFromClient !== user.email
            ? { email: emailFromClient }
            : {}),
        },
      });

      const isAdmin = isAdminEmail(user.email);

      return NextResponse.json({
        user,
        isNewUser,
        isAdmin,
        message: "Welcome back!",
      });
    }
  } catch (error) {
    console.error("User POST API error:", error);
    return NextResponse.json(
      { error: "Failed to process user data" },
      { status: 500 }
    );
  }
}

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
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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

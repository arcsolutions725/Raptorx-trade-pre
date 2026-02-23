import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/claw-v5/chats - Fetch all chats for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const chats = await prisma.clawV5Chat.findMany({
      where: {
        userId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
          take: 1, // Only get first message for preview
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json({ chats });
  } catch (error) {
    console.error("Error fetching chats:", error);
    return NextResponse.json(
      { error: "Failed to fetch chats" },
      { status: 500 }
    );
  }
}

// POST /api/claw-v5/chats - Create a new chat
export async function POST(request: NextRequest) {
  try {
    const { userId, title } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const chat = await prisma.clawV5Chat.create({
      data: {
        userId,
        title: title || "New Chat",
      },
      include: {
        messages: true,
      },
    });

    return NextResponse.json({ chat });
  } catch (error) {
    console.error("Error creating chat:", error);
    return NextResponse.json(
      { error: "Failed to create chat" },
      { status: 500 }
    );
  }
}


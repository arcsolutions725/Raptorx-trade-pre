import { NextResponse } from "next/server";
import { getBNBHolderAnalytics } from "@/lib/api/bnbAnalytics";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const contractAddress = searchParams.get("contractAddress");

    if (!contractAddress) {
      return NextResponse.json(
        { success: false, error: "Contract address is required" },
        { status: 400 },
      );
    }

    const result = await getBNBHolderAnalytics(contractAddress);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in BNB analytics API route:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error fetching BNB analytics",
      },
      { status: 500 },
    );
  }
}

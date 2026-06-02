import { NextRequest, NextResponse } from "next/server";
import { fetchPredictFunMarketDetailsById } from "@/lib/predictfun/fetchPredictFunMarketDetails";

/** GET /api/predictfun/market-details?id=... */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const result = await fetchPredictFunMarketDetailsById(id);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, detail: result.details },
      { status: 502 }
    );
  }
  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";

const DFLOW_METADATA_BASE =
  process.env.DFLOW_METADATA_API_BASE ||
  "https://b.prediction-markets-api.dflow.net";

const isProductionMetadata = (base: string) =>
  base.includes("b.prediction-markets-api.dflow.net");

/**
 * POST /api/kalshi/dflow-markets-batch
 * Proxies to DFlow POST /api/v1/markets/batch. Body: { mints: string[] }.
 * Docs: https://pond.dflow.net/build/recipes/prediction-markets/track-positions
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DFLOW_API_KEY;
    const base = DFLOW_METADATA_BASE;
    const useProduction = isProductionMetadata(base);

    const body = await request.json().catch(() => ({}));
    const mints = Array.isArray(body.mints) ? body.mints : [];
    if (mints.length === 0) {
      return NextResponse.json(
        { error: "Body must include mints (array of outcome mint addresses)" },
        { status: 400 }
      );
    }

    const url = `${base}/api/v1/markets/batch`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (useProduction && apiKey) {
      headers["x-api-key"] = apiKey;
    }

    let response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ mints }),
      cache: "no-store",
    });

    let data = (await response.json().catch(() => ({}))) as {
      markets?: unknown[];
      error?: string;
    };

    if (response.status === 403 && useProduction) {
      const devBase = "https://dev-prediction-markets-api.dflow.net";
      const devResponse = await fetch(`${devBase}/api/v1/markets/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mints }),
        cache: "no-store",
      });
      data = (await devResponse.json().catch(() => ({}))) as {
        markets?: unknown[];
        error?: string;
      };
      if (devResponse.ok) {
        return NextResponse.json(data);
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error ?? `DFlow markets/batch failed: ${response.status}` },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DFlow markets/batch error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch markets batch";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

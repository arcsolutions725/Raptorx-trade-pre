import { NextRequest, NextResponse } from "next/server";

const DFLOW_METADATA_BASE =
  process.env.DFLOW_METADATA_API_BASE ||
  "https://b.prediction-markets-api.dflow.net";

const isProductionMetadata = (base: string) =>
  base.includes("b.prediction-markets-api.dflow.net");

/**
 * POST /api/kalshi/dflow-filter-outcome-mints
 * Proxies to DFlow POST /api/v1/filter_outcome_mints. Body: { addresses: string[] }.
 * Docs: https://pond.dflow.net/build/recipes/prediction-markets/track-positions
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DFLOW_API_KEY;
    const base = DFLOW_METADATA_BASE;
    const useProduction = isProductionMetadata(base);

    const body = await request.json().catch(() => ({}));
    const addresses = Array.isArray(body.addresses) ? body.addresses : [];
    if (addresses.length === 0) {
      return NextResponse.json(
        { error: "Body must include addresses (array of mint addresses)" },
        { status: 400 }
      );
    }

    const url = `${base}/api/v1/filter_outcome_mints`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (useProduction && apiKey) {
      headers["x-api-key"] = apiKey;
    }

    let response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ addresses }),
      cache: "no-store",
    });

    let data = (await response.json().catch(() => ({}))) as {
      outcomeMints?: string[];
      error?: string;
    };

    if (response.status === 403 && useProduction) {
      const devBase = "https://dev-prediction-markets-api.dflow.net";
      const devResponse = await fetch(`${devBase}/api/v1/filter_outcome_mints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
        cache: "no-store",
      });
      data = (await devResponse.json().catch(() => ({}))) as {
        outcomeMints?: string[];
        error?: string;
      };
      if (devResponse.ok) {
        return NextResponse.json(data);
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error ?? `DFlow filter_outcome_mints failed: ${response.status}` },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DFlow filter_outcome_mints error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to filter outcome mints";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

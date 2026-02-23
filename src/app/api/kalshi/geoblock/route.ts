import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { isKalshiRestrictedCountry } from "@/constants/kalshiRestrictedJurisdictions";

export type KalshiGeoblockResponse = {
  blocked: boolean;
  ip?: string;
  country: string;
  region: string;
};

/**
 * GET /api/kalshi/geoblock
 *
 * Returns whether the requesting IP is in a Kalshi restricted jurisdiction
 * per the Kalshi Member Agreement (Restricted Jurisdictions list).
 * Uses Vercel geo headers when available, otherwise falls back to ip-api.com.
 */
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();

    // Prefer Vercel geo headers (set in production on Vercel)
    const vercelCountry = headersList.get("x-vercel-ip-country");
    const vercelRegion = headersList.get("x-vercel-ip-country-region") ?? "";
    const forwardedFor = headersList.get("x-forwarded-for");
    const realIp = headersList.get("x-real-ip");
    const clientIp =
      forwardedFor?.split(",")[0]?.trim() || realIp || "";

    let countryCode = vercelCountry?.toUpperCase?.().trim() ?? "";
    let region = vercelRegion ?? "";

    // When not on Vercel (e.g. local dev), x-vercel-ip-country is missing — fallback to IP lookup
    if (!countryCode && clientIp) {
      try {
        const res = await fetch(
          `http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=status,country,countryCode,region`,
          { next: { revalidate: 0 } }
        );
        const data = (await res.json()) as {
          status?: string;
          countryCode?: string;
          country?: string;
          region?: string;
        };
        if (data?.status === "success" && data.countryCode) {
          countryCode = String(data.countryCode).toUpperCase().trim();
          region = data.region ?? data.country ?? "";
        }
      } catch {
        // On fallback failure, allow (do not block) to avoid false positives
      }
    }

    const blocked = isKalshiRestrictedCountry(countryCode);
    const country = countryCode || "Unknown";

    const body: KalshiGeoblockResponse = {
      blocked,
      country,
      region,
    };
    if (clientIp) body.ip = clientIp;

    return NextResponse.json(body);
  } catch (err) {
    console.error("Kalshi geoblock error:", err);
    return NextResponse.json(
      {
        blocked: false,
        country: "Unknown",
        region: "",
        error: "Geoblock check failed",
      } as KalshiGeoblockResponse & { error?: string },
      { status: 200 }
    );
  }
}

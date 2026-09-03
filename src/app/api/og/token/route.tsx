import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import {
  fetchScreenerTokenOgData,
  formatOgUsd,
  getOgSiteUrl,
} from "@/lib/og/screenerTokenOg";
import { isScreenerChainSlug } from "@/lib/rexscreenerRoutes";

export const runtime = "nodejs";

async function toPngDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "image/*" },
    });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    const sharp = (await import("sharp")).default;
    const png = await sharp(buf)
      .resize(320, 320, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chainSlug = (searchParams.get("chain") || "").trim().toLowerCase();
    const address = (searchParams.get("address") || "").trim();

    if (!isScreenerChainSlug(chainSlug) || !address) {
      return new Response("Missing chain or address", { status: 400 });
    }

    const token = await fetchScreenerTokenOgData(chainSlug, address);
    if (!token) {
      return new Response("Token not found", { status: 404 });
    }

    const host =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto =
      request.headers.get("x-forwarded-proto") ||
      request.nextUrl.protocol.replace(":", "");
    const siteUrl = request.nextUrl.origin || getOgSiteUrl(host, proto);

    const [logoSrc, brandSrc] = await Promise.all([
      toPngDataUrl(token.logoUrl),
      toPngDataUrl(`${siteUrl}/images/raptorx.png`),
    ]);

    const ticker = (token.symbol || "TOKEN").replace(/^\$/, "").slice(0, 14);
    const name = (token.name || ticker).slice(0, 36);
    const initial = ticker.slice(0, 1).toUpperCase();
    const priceText = formatOgUsd(token.priceUsd);
    const mcapText = formatOgUsd(token.marketCap);
    const showMcap = mcapText !== "—";
    const showPrice = priceText !== "—";

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            backgroundColor: "#FFC000",
            padding: 10,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#0a0a0a",
              borderRadius: 28,
              padding: "48px 56px 40px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -80,
                top: -90,
                width: 340,
                height: 340,
                borderRadius: 170,
                backgroundColor: "#FFC000",
                opacity: 0.08,
                display: "flex",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: -60,
                bottom: -100,
                width: 280,
                height: 280,
                borderRadius: 140,
                backgroundColor: "#FFC000",
                opacity: 0.05,
                display: "flex",
              }}
            />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 36,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#FFC000",
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: 4,
                }}
              >
                REXSCREENER
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 22px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,192,0,0.45)",
                  color: "#FFC000",
                  fontSize: 28,
                  fontWeight: 700,
                }}
              >
                {token.chainLabel}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 40,
                flex: 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 220,
                  height: 220,
                  borderRadius: 110,
                  border: "6px solid #FFC000",
                  backgroundColor: "#141414",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {logoSrc ? (
                  <img
                    src={logoSrc}
                    alt=""
                    width={220}
                    height={220}
                    style={{
                      width: 220,
                      height: 220,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      color: "#FFC000",
                      fontSize: 108,
                      fontWeight: 800,
                    }}
                  >
                    {initial}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    color: "#FFC000",
                    fontSize: 108,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: -2,
                  }}
                >
                  ${ticker}
                </div>
                <div
                  style={{
                    display: "flex",
                    color: "#ffffff",
                    fontSize: 42,
                    fontWeight: 600,
                    marginTop: 16,
                    opacity: 0.92,
                  }}
                >
                  {name}
                </div>
                {(showPrice || showMcap) ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 18,
                      marginTop: 32,
                    }}
                  >
                    {showPrice ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          padding: "16px 26px",
                          borderRadius: 16,
                          backgroundColor: "#161616",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            color: "rgba(255,255,255,0.5)",
                            fontSize: 22,
                            fontWeight: 700,
                            letterSpacing: 1,
                          }}
                        >
                          PRICE
                        </div>
                        <div
                          style={{
                            display: "flex",
                            color: "#ffffff",
                            fontSize: 40,
                            fontWeight: 800,
                            marginTop: 6,
                          }}
                        >
                          {priceText}
                        </div>
                      </div>
                    ) : null}
                    {showMcap ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          padding: "16px 26px",
                          borderRadius: 16,
                          backgroundColor: "#161616",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            color: "rgba(255,255,255,0.5)",
                            fontSize: 22,
                            fontWeight: 700,
                            letterSpacing: 1,
                          }}
                        >
                          MCAP
                        </div>
                        <div
                          style={{
                            display: "flex",
                            color: "#ffffff",
                            fontSize: 40,
                            fontWeight: 800,
                            marginTop: 6,
                          }}
                        >
                          {mcapText}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 28,
              }}
            >
              <div
                style={{
                  display: "flex",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 28,
                }}
              >
                AI research report · raptorx.trade
              </div>
              {brandSrc ? (
                <img
                  src={brandSrc}
                  alt="RaptorX"
                  width={160}
                  height={48}
                  style={{
                    height: 48,
                    width: 160,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    color: "#FFC000",
                    fontSize: 32,
                    fontWeight: 800,
                  }}
                >
                  RaptorX
                </div>
              )}
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );

    const headers = new Headers(imageResponse.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
    );
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET");

    return new Response(imageResponse.body, {
      status: imageResponse.status,
      statusText: imageResponse.statusText,
      headers,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("OG token image:", message);
    return new Response(`Failed to generate image: ${message}`, { status: 500 });
  }
}

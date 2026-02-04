import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventSlug = searchParams.get("slug");

    if (!eventSlug) {
      return new Response("Missing slug parameter", { status: 400 });
    }

    // Fetch market details
    // Use request URL to determine base URL for local development
    // Always use HTTPS for production to ensure Twitter compatibility
    const host = request.headers.get("host");
    let protocol = request.nextUrl.protocol;
    if (!protocol) {
      protocol = process.env.NODE_ENV === "production" ? "https:" : "http:";
    }
    // Force HTTPS in production
    if (process.env.NODE_ENV === "production" && protocol === "http:") {
      protocol = "https:";
    }
    
    let baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!baseUrl && host) {
      baseUrl = `${protocol}//${host}`;
    }
    if (!baseUrl) {
      baseUrl = "https://raptorx.trade";
    }
    
    // Ensure baseUrl always uses HTTPS in production
    if (baseUrl.startsWith("http://") && process.env.NODE_ENV === "production") {
      baseUrl = baseUrl.replace("http://", "https://");
    }
    const marketDetailsUrl = `${baseUrl}/api/polymarket/market-details?slug=${encodeURIComponent(
      eventSlug
    )}`;

    let marketData: any = null;
    try {
      const marketRes = await fetch(marketDetailsUrl, {
        cache: "no-store",
      });
      if (marketRes.ok) {
        marketData = await marketRes.json();
      }
    } catch (error) {
      console.error("Failed to fetch market data:", error);
    }

    const title = marketData?.title || "Polymarket Event";
    const imageUrl = marketData?.symbol_image_url || "";
    const totalVolume = marketData?.total_volume || 0;
    const markets = marketData?.markets || [];

    // Calculate average probability/price
    const avgPrice =
      markets.length > 0
        ? markets.reduce((sum: number, m: any) => sum + (m.yes_price || 0), 0) /
          markets.length
        : 0;

    const pricePercent = Math.round(avgPrice * 100);

    // Generate the image response
    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            backgroundColor: "#000000",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Left Panel - Image */}
          <div
            style={{
              width: "50%",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              backgroundColor: "#1a1a1a",
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#1a1a1a",
                  color: "#ffffff",
                  fontSize: 24,
                  padding: 40,
                  textAlign: "center",
                }}
              >
                {title}
              </div>
            )}
            {/* Overlay text with background for better readability */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                display: "flex",
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)",
                padding: "50px 20px 20px 20px",
              }}
            >
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 22,
                  fontWeight: "bold",
                  textShadow:
                    "1px 1px 3px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.8)",
                  display: "flex",
                  lineHeight: 1.2,
                  maxWidth: "95%",
                  wordWrap: "break-word",
                }}
              >
                {title.length > 65 ? title.substring(0, 65) + "..." : title}
              </div>
            </div>
          </div>

          {/* Right Panel - Data Visualization */}
          <div
            style={{
              width: "50%",
              display: "flex",
              flexDirection: "column",
              padding: 40,
              backgroundColor: "#0a0a0a",
              justifyContent: "space-between",
            }}
          >
            {/* Title */}
            <div
              style={{
                color: "#ffffff",
                fontSize: 28,
                fontWeight: "bold",
                marginBottom: 30,
                lineHeight: 1.2,
                display: "flex",
              }}
            >
              {title.length > 60 ? title.substring(0, 60) + "..." : title}
            </div>

            {/* Price Display */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 20,
                marginBottom: 30,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      color: "#ffc000",
                      fontSize: 48,
                      fontWeight: "bold",
                      display: "flex",
                    }}
                  >
                    {pricePercent}%
                  </div>
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 18,
                      opacity: 0.8,
                      display: "flex",
                    }}
                  >
                    Current Price
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 32,
                      fontWeight: "bold",
                      display: "flex",
                    }}
                  >
                    ${totalVolume.toLocaleString()}
                  </div>
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 18,
                      opacity: 0.8,
                      display: "flex",
                    }}
                  >
                    Total Volume
                  </div>
                </div>
              </div>

              {/* Red area with raptorx-og image */}
              <div
                style={{
                  display: "flex",
                  width: 200,
                  height: 200,
                  overflow: "hidden",
                }}
              >
                <img
                  src={`${baseUrl}/images/raptorx-og.png`}
                  alt="RaptorX"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "flex",
                  }}
                />
              </div>
            </div>

            {/* Market Stats */}
            {markets.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {markets.slice(0, 3).map((market: any, index: number) => (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      backgroundColor: "#1a1a1a",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        color: "#ffffff",
                        fontSize: 16,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "flex",
                      }}
                    >
                      {market.subtitle ||
                        market.groupItemTitle ||
                        `Market ${index + 1}`}
                    </div>
                    <div
                      style={{
                        color: "#ffc000",
                        fontSize: 18,
                        fontWeight: "bold",
                        marginLeft: 12,
                        display: "flex",
                      }}
                    >
                      {Math.round((market.yes_price || 0) * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex" }}></div>
            )}

            {/* Footer */}
            <div
              style={{
                marginTop: "auto",
                paddingTop: 20,
                borderTop: "1px solid #333333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                {/* Website */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      display: "flex",
                    }}
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      fill="none"
                      opacity="0.7"
                    />
                    <path
                      d="M2 12h20M12 2a15.3 15.3 0 0 1 4 8 15.3 15.3 0 0 1-4 8 15.3 15.3 0 0 1-4-8 15.3 15.3 0 0 1 4-8z"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      fill="none"
                      opacity="0.7"
                    />
                  </svg>
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 14,
                      opacity: 0.7,
                      display: "flex",
                    }}
                  >
                    raptorx.trade
                  </div>
                </div>

                {/* Telegram */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <img
                    src={`${baseUrl}/images/telegram.png`}
                    alt="Telegram"
                    style={{
                      width: 16,
                      height: 16,
                      objectFit: "contain",
                      display: "flex",
                    }}
                  />
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 14,
                      opacity: 0.7,
                      display: "flex",
                    }}
                  >
                    @huntonraptor
                  </div>
                </div>

                {/* X/Twitter */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <img
                    src={`${baseUrl}/images/x.png`}
                    alt="X"
                    style={{
                      width: 16,
                      height: 16,
                      objectFit: "contain",
                      display: "flex",
                    }}
                  />
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 14,
                      opacity: 0.7,
                      display: "flex",
                    }}
                  >
                    @huntonraptor
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );

    // Clone the response and add additional headers for Twitter compatibility
    const headers = new Headers(imageResponse.headers);
    headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET");
    
    return new Response(imageResponse.body, {
      status: imageResponse.status,
      statusText: imageResponse.statusText,
      headers: headers,
    });
  } catch (error: any) {
    console.error("OG image generation error:", error);
    return new Response(`Failed to generate image: ${error.message}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }
}

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

// Node runtime required for WebP→PNG conversion (sharp) so Kalshi symbol images load
export const runtime = "nodejs";

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host");
  let protocol = request.nextUrl.protocol;
  if (!protocol) {
    protocol = process.env.NODE_ENV === "production" ? "https:" : "http:";
  }
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
  if (baseUrl.startsWith("http://") && process.env.NODE_ENV === "production") {
    baseUrl = baseUrl.replace("http://", "https://");
  }
  return baseUrl;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventSlug = searchParams.get("slug");
    const eventTicker = searchParams.get("event_ticker");

    if (!eventSlug && !eventTicker) {
      return new Response("Missing slug or event_ticker parameter", {
        status: 400,
      });
    }

    const baseUrl = getBaseUrl(request);
    const isKalshi = !!eventTicker;
    let marketData: any = null;

    if (isKalshi) {
      // Fetch directly from Kalshi API to avoid self-request deadlock (Edge calling localhost)
      try {
        const [eventsRes, metadataRes] = await Promise.all([
          fetch(
            `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(eventTicker!)}`,
            { cache: "no-store" },
          ),
          fetch(
            `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(eventTicker!)}/metadata`,
            { cache: "no-store" },
          ).catch(() => null),
        ]);
        if (!eventsRes.ok) throw new Error(`Kalshi API ${eventsRes.status}`);
        const eventsData = await eventsRes.json();
        let metadataImageUrl: string | undefined;
        if (metadataRes?.ok) {
          try {
            const meta = await metadataRes.json();
            metadataImageUrl = meta.image_url;
          } catch {
            // ignore
          }
        }
        const event = eventsData.event || {};
        const allMarkets: any[] = Array.isArray(eventsData.markets)
          ? eventsData.markets
          : [];
        // OG image: show only active markets (exclude finalized), same as trading UI
        const markets: any[] = allMarkets.filter(
          (m: any) => (m.status || "").toLowerCase() === "active",
        );
        const transformedMarkets = markets.map((market: any, index: number) => {
          const lastPriceCents = Number(market.last_price) || 0;
          const lastPriceDollarsStr = market.last_price_dollars;
          const lastPriceDollars = lastPriceDollarsStr
            ? Number(lastPriceDollarsStr)
            : lastPriceCents / 100;
          const yesPrice = Number(lastPriceDollars) || 0;
          const candidateName =
            market.custom_strike?.Candidate ||
            market.custom_strike?.candidate ||
            market.subtitle ||
            market.yes_sub_title ||
            market.no_sub_title ||
            market.title ||
            `Outcome ${index + 1}`;
          const marketId =
            market.market_id ||
            market.id ||
            market.market_ticker ||
            market.ticker ||
            null;
          return {
            ticker: market.ticker || `market-${index}`,
            market_id: marketId,
            subtitle: candidateName,
            yes_price: yesPrice,
            volume: Number(market.volume) || 0,
          };
        });
        const totalVolume = transformedMarkets.reduce(
          (sum: number, m: any) => sum + (m.volume || 0),
          0,
        );
        const seriesTicker = event.series_ticker || eventTicker;
        const symbolImageUrl =
          metadataImageUrl ||
          `https://d1lvyva3zy5u58.cloudfront.net/series-images-webp/${seriesTicker}.webp?size=sm`;
        // Use the same data source as Kalshi PriceChart: event + markets from Kalshi API only (no price-history API).
        marketData = {
          title: event.title || "",
          series_ticker: seriesTicker,
          symbol_image_url: symbolImageUrl,
          total_volume: totalVolume,
          markets: transformedMarkets,
        };
      } catch (error) {
        console.error("Failed to fetch Kalshi market data:", error);
      }
    } else {
      const marketDetailsUrl = `${baseUrl}/api/polymarket/market-details?slug=${encodeURIComponent(
        eventSlug!,
      )}`;
      try {
        const marketRes = await fetch(marketDetailsUrl, {
          cache: "no-store",
        });
        if (marketRes.ok) {
          marketData = await marketRes.json();
        }
      } catch (error) {
        console.error("Failed to fetch Polymarket market data:", error);
      }
    }

    const defaultTitle = isKalshi ? "Kalshi Event" : "Polymarket Event";
    const title = marketData?.title || defaultTitle;
    const rawImageUrl = marketData?.symbol_image_url || "";
    const isWebP =
      rawImageUrl &&
      (/\.webp(\?|$)/i.test(rawImageUrl) || rawImageUrl.includes("webp"));
    let imageUrl = "";
    if (rawImageUrl) {
      if (isWebP) {
        try {
          const imgRes = await fetch(rawImageUrl, { cache: "no-store" });
          if (imgRes.ok) {
            const sharp = (await import("sharp")).default;
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const pngBuffer = await sharp(buf).png().toBuffer();
            imageUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
          }
        } catch (e) {
          console.warn("OG: WebP to PNG conversion failed, using no image", e);
        }
      } else {
        imageUrl = rawImageUrl;
      }
    }
    const totalVolume = marketData?.total_volume || 0;
    const markets = marketData?.markets || [];
    // Both Kalshi and Polymarket: sort by probability (yes_price) desc, take top outcomes — leading % at top, rest below
    const displayMarkets = [...markets]
      .sort((a: any, b: any) => (b.yes_price ?? 0) - (a.yes_price ?? 0))
      .slice(0, 5);
    const leadingMarket = displayMarkets[0];
    const restMarkets = displayMarkets.slice(1);

    // Generate the image response
    const imageResponse = new ImageResponse(
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
              width={600}
              height={630}
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
            position: "relative",
          }}
        >
          {/* Top: [Total Volume + Title] left (tight block) | Logo right */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    color: "#ffffff",
                    fontSize: 14,
                    opacity: 0.8,
                  }}
                >
                  Total Volume
                </span>
                <span
                  style={{
                    color: "#ffc000",
                    fontSize: 16,
                    fontWeight: "bold",
                  }}
                >
                  ${totalVolume.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 28,
                  fontWeight: "bold",
                  lineHeight: 1.2,
                  display: "flex",
                }}
              >
                {title.length > 60 ? title.substring(0, 60) + "..." : title}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                width: 140,
                height: 140,
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <img
                src={`${baseUrl}/images/raptorx-og.png`}
                alt="RaptorX"
                width={140}
                height={140}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "flex",
                }}
              />
            </div>
          </div>

          {/* Leading outcome: most users have bet on this % — shown prominently at top */}
          {leadingMarket ? (
            <div
              style={{
                marginBottom: 20,
                padding: "20px 24px",
                backgroundColor: "#1a1a1a",
                borderRadius: 12,
                border: "2px solid #ffc000",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  color: "#ffc000",
                  fontSize: 42,
                  fontWeight: "bold",
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                {(Number(leadingMarket.yes_price ?? 0) * 100).toFixed(1)}%
              </div>
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 18,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "flex",
                }}
              >
                {leadingMarket.subtitle ||
                  leadingMarket.groupItemTitle ||
                  "Leading outcome"}
              </div>
            </div>
          ) : null}

          {/* Other outcomes in hierarchy below */}
          {restMarkets.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                paddingBottom: 6,
              }}
            >
              {restMarkets.map((market: any, index: number) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    backgroundColor: "#1a1a1a",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 15,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "flex",
                      opacity: 0.95,
                    }}
                  >
                    {market.subtitle ||
                      market.groupItemTitle ||
                      `Outcome ${index + 2}`}
                  </div>
                  <div
                    style={{
                      color: "rgba(255,192,0,0.9)",
                      fontSize: 16,
                      fontWeight: "bold",
                      marginLeft: 12,
                      display: "flex",
                    }}
                  >
                    {(Number(market.yes_price ?? 0) * 100).toFixed(1)}%
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
                  width={16}
                  height={16}
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
                  width={16}
                  height={16}
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
      </div>,
      {
        width: 1200,
        height: 630,
      },
    );

    // Clone the response and add additional headers for Twitter compatibility
    const headers = new Headers(imageResponse.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    );
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

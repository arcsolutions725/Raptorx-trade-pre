"use client";

import Image from "next/image";
import { BarChart2, LineChart, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { CoinOMetry } from "@/components/CoinOMetry";
import { HolderAnalyticsComponent } from "@/components/analytics/HolderAnalytics";
import { BirdeyeSafetyAnalyticsComponent } from "@/components/analytics/BirdeyeSafetyAnalytics";

type ChartDataPoint = { time?: number; value: number };

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // GFM tables
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    // Common helpful tags
    "details",
    "summary",
    "kbd",
  ],
  attributes: {
    ...(defaultSchema.attributes || {}),
    a: [
      ...((defaultSchema.attributes as any)?.a || []),
      "target",
      "rel",
      "title",
    ],
    img: [
      ...((defaultSchema.attributes as any)?.img || []),
      "src",
      "alt",
      "title",
      "width",
      "height",
      "loading",
    ],
    th: [
      ...((defaultSchema.attributes as any)?.th || []),
      "align",
      "colspan",
      "rowspan",
    ],
    td: [
      ...((defaultSchema.attributes as any)?.td || []),
      "align",
      "colspan",
      "rowspan",
    ],
    code: [...((defaultSchema.attributes as any)?.code || []), "className"],
  },
  protocols: {
    ...(defaultSchema.protocols || {}),
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https", "data"],
  },
};

const markdownComponents = {
  h1: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-white font-semibold text-lg mt-3 mb-2" {...props} />
  ),
  h2: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-white font-semibold text-base! mt-3 mb-2" {...props} />
  ),
  h3: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className="text-[#ffc000]/80 font-semibold text-sm! mt-3 mb-2"
      {...props}
    />
  ),
  p: ({ ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-white/80 leading-relaxed my-2 break-words" {...props} />
  ),
  strong: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="text-white font-semibold" {...props} />
  ),
  em: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="text-white/80 italic" {...props} />
  ),
  a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="text-[#ffc000] underline underline-offset-2 hover:text-[#ffda44] break-all whitespace-normal"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  ul: ({ ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside my-2 space-y-1" {...props} />
  ),
  ol: ({ ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside my-2 space-y-1" {...props} />
  ),
  li: ({ ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-white/80 break-words" {...props} />
  ),
  blockquote: ({ ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-2 border-[#ffc000]/60 pl-3 my-3 text-white/70"
      {...props}
    />
  ),
  hr: ({ ...props }: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="border-white/10 my-4" {...props} />
  ),
  code: ({ inline, className, children, ...props }: any) => {
    if (inline) {
      return (
        <code
          className={`bg-white/10 px-1 py-0.5 rounded text-[13px] break-words ${
            className || ""
          }`}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`text-[13px] ${className || ""}`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="bg-white/10 p-3 rounded-lg overflow-x-hidden whitespace-pre-wrap break-words my-3 text-[13px] leading-relaxed max-w-full"
      {...props}
    >
      {children}
    </pre>
  ),
  table: ({ ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="my-3 overflow-hidden">
      <table className="w-full border-collapse table-fixed" {...props} />
    </div>
  ),
  th: ({ ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="border border-white/10 px-2 py-1 text-left text-white/80 break-words align-top"
      {...props}
    />
  ),
  td: ({ ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td
      className="border border-white/10 px-2 py-1 text-white/70 align-top break-words"
      {...props}
    />
  ),
};

function renderMarkdownSection(body: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeSanitize as any, sanitizeSchema as any],
      ]}
      components={markdownComponents as any}
    >
      {body}
    </ReactMarkdown>
  );
}

function getSectionIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("what it is")) return "📘";
  if (t.includes("community")) return "🧠";
  if (t.includes("tweet")) return "🐦";
  if (t.includes("coin-o-metry")) return "🧮";
  if (t.includes("holder")) return "👥";
  if (t.includes("safety")) return "🛡️";
  if (t.includes("technical analysis")) return "📈";
  return "📄";
}

function formatNum(val: any, digits = 4): string {
  const n =
    typeof val === "number" ? val : typeof val === "string" ? Number(val) : NaN;
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function lastOf(arr: any): any {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[arr.length - 1];
}

function toSeries(arr: any): number[] {
  if (!Array.isArray(arr)) return [];
  const out: number[] = [];
  for (const it of arr) {
    if (typeof it === "number") out.push(it);
    else if (it && typeof (it as ChartDataPoint).value === "number")
      out.push((it as ChartDataPoint).value);
  }
  return out;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function buildLinePath(
  values: number[],
  w: number,
  h: number,
  pad = 6,
): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (innerW * i) / (values.length - 1);
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });
  return pts
    .map(
      ([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(" ");
}

function MiniLineChart({
  series,
  series2,
  height = 96,
  thresholds,
}: {
  series: number[];
  series2?: number[];
  height?: number;
  thresholds?: Array<{ value: number; label?: string }>;
}) {
  const w = 640;
  const h = height;
  const s1 = series.slice(-60);
  const s2 = (series2 || []).slice(-60);

  const all = [...s1, ...s2];
  if (all.length < 2) return null;

  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = 6;
  const innerH = h - pad * 2;

  const yFor = (v: number) => pad + innerH - ((v - min) / span) * innerH;

  const path1 = buildLinePath(s1, w, h, pad);
  const path2 = s2.length >= 2 ? buildLinePath(s2, w, h, pad) : "";

  return (
    <div className="w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto block">
        {/* grid */}
        <g opacity="0.25">
          {[0.25, 0.5, 0.75].map((p) => (
            <line
              key={p}
              x1={0}
              x2={w}
              y1={pad + innerH * p}
              y2={pad + innerH * p}
              stroke="white"
              strokeWidth="1"
            />
          ))}
        </g>

        {/* thresholds */}
        {thresholds?.map((t, idx) => {
          const y = yFor(t.value);
          return (
            <g key={idx} opacity="0.9">
              <line
                x1={0}
                x2={w}
                y1={y}
                y2={y}
                stroke="#FFC000"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            </g>
          );
        })}

        {/* lines */}
        {path1 && (
          <path d={path1} fill="none" stroke="#FFC000" strokeWidth="2" />
        )}
        {path2 && (
          <path
            d={path2}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="2"
          />
        )}

        {/* last dots */}
        <circle
          cx={w - 6}
          cy={yFor(s1[s1.length - 1])}
          r="3.2"
          fill="#FFC000"
        />
        {s2.length > 0 && (
          <circle
            cx={w - 6}
            cy={yFor(s2[s2.length - 1])}
            r="3.2"
            fill="rgba(255,255,255,0.55)"
          />
        )}
      </svg>
    </div>
  );
}

function MiniHistogramChart({
  series,
  height = 72,
}: {
  series: number[];
  height?: number;
}) {
  const w = 640;
  const h = height;
  const vals = series.slice(-60);
  if (vals.length < 2) return null;

  const maxAbs = Math.max(...vals.map((v) => Math.abs(v))) || 1;
  const mid = h / 2;
  const barW = w / vals.length;

  return (
    <div className="w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto block">
        <line
          x1={0}
          x2={w}
          y1={mid}
          y2={mid}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1"
        />
        {vals.map((v, i) => {
          const mag = (Math.abs(v) / maxAbs) * (mid - 6);
          const isPos = v >= 0;
          const x = i * barW;
          const y = isPos ? mid - mag : mid;
          const fill = isPos ? "rgba(0,176,80,0.9)" : "rgba(255,65,54,0.9)";
          return (
            <rect
              key={i}
              x={x + barW * 0.15}
              width={Math.max(1, barW * 0.7)}
              y={y}
              height={mag}
              rx={1.5}
              fill={fill}
            />
          );
        })}
      </svg>
    </div>
  );
}

function CupHandleTimeline({ pattern }: { pattern: any }) {
  const detected = Boolean(pattern?.detected);
  const cupStart = Number(pattern?.cupStart);
  const cupEnd = Number(pattern?.cupEnd);
  const handleStart = Number(pattern?.handleStart);
  const handleEnd = Number(pattern?.handleEnd);
  const maxPos = Math.max(cupStart, cupEnd, handleStart, handleEnd, 1);

  const pct = (n: number) => `${clamp((n / maxPos) * 100, 0, 100)}%`;

  return (
    <div className="w-full rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-white/80 text-xs font-semibold">
          Pattern timeline
        </div>
        <div className="text-white/50 text-xs">
          {detected ? "Detected" : "Not detected"}
        </div>
      </div>
      <div className="relative h-3 rounded-full bg-white/10 overflow-hidden">
        <div
          className="absolute top-0 h-full bg-[#FFC000]/70"
          style={{
            left: pct(cupStart),
            width: `calc(${pct(cupEnd)} - ${pct(cupStart)})`,
          }}
          title="Cup"
        />
        <div
          className="absolute top-0 h-full bg-white/30"
          style={{
            left: pct(handleStart),
            width: `calc(${pct(handleEnd)} - ${pct(handleStart)})`,
          }}
          title="Handle"
        />
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="text-white/60">Cup</div>
        <div className="text-white/80 font-mono">
          {Number.isFinite(cupStart) && Number.isFinite(cupEnd)
            ? `${cupStart} → ${cupEnd}`
            : "—"}
        </div>
        <div className="text-white/60">Handle</div>
        <div className="text-white/80 font-mono">
          {Number.isFinite(handleStart) && Number.isFinite(handleEnd)
            ? `${handleStart} → ${handleEnd}`
            : "—"}
        </div>
      </div>
    </div>
  );
}

function getIndicatorLabel(t: string) {
  if (t === "macd") return "MACD Lines";
  if (t === "rsi") return "RSI Indicator";
  if (t === "cuphandle") return "Cup & Handle";
  if (t === "all") return "Generate All";
  return t;
}

function IndicatorEmbed({ payload }: { payload: any }) {
  const token = payload?.token ?? null;
  const analysis = payload?.analysis ?? null;
  const indicatorType = String(
    analysis?.indicatorType ||
      payload?.analysis?.indicator ||
      payload?.indicatorType ||
      "",
  ).toLowerCase();
  const timeframe = analysis?.timeframe || "15m";
  const chartData = analysis?.chartData ?? {};

  const symbol = token?.symbol || token?.name || "Token";
  const logo = token?.logo || null;

  const macd = indicatorType === "all" ? chartData?.macd : chartData;
  const rsi = indicatorType === "all" ? chartData?.rsi : chartData;
  const cup = indicatorType === "all" ? chartData?.cuphandle : chartData;

  const macdLine = toSeries(macd?.macdLine);
  const signalLine = toSeries(macd?.signalLine);
  const hist = toSeries(macd?.histogram);
  const rsiValues = toSeries(rsi?.values);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
            {logo ? (
              <Image
                src={logo}
                alt=""
                width={36}
                height={36}
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-black/50" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold truncate">{symbol}</div>
            <div className="text-white/50 text-xs truncate">
              {getIndicatorLabel(indicatorType)} • {timeframe}
            </div>
          </div>
        </div>
        <div className="hidden sm:block text-white/40 text-xs">
          RaptorX • Technical Analysis
        </div>
      </div>

      {/* Charts */}
      <div className="px-3 pb-2 sm:px-4">
        {indicatorType === "macd" && (
          <div className="grid grid-cols-1 gap-2">
            <MiniLineChart
              series={macdLine}
              series2={signalLine}
              height={110}
            />
            <MiniHistogramChart series={hist} height={80} />
            <div className="text-white/50 text-[12px]">
              Yellow: MACD • White: Signal • Histogram: momentum
            </div>
          </div>
        )}

        {indicatorType === "rsi" && (
          <div className="grid grid-cols-1 gap-2">
            <MiniLineChart
              series={rsiValues}
              height={120}
              thresholds={[
                { value: Number(rsi?.overbought ?? 70) },
                { value: Number(rsi?.oversold ?? 30) },
              ]}
            />
            <div className="text-white/50 text-[12px]">
              Dotted lines: overbought/oversold thresholds
            </div>
          </div>
        )}

        {indicatorType === "cuphandle" && (
          <CupHandleTimeline pattern={cup?.pattern} />
        )}

        {indicatorType === "all" && (
          <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="text-white/70 text-xs font-semibold mb-2">
                MACD
              </div>
              <MiniLineChart
                series={macdLine}
                series2={signalLine}
                height={110}
              />
              <div className="mt-2">
                <MiniHistogramChart series={hist} height={80} />
              </div>
            </div>
            <div>
              <div className="text-white/70 text-xs font-semibold mb-2">
                RSI
              </div>
              <MiniLineChart
                series={rsiValues}
                height={120}
                thresholds={[
                  { value: Number(rsi?.overbought ?? 70) },
                  { value: Number(rsi?.oversold ?? 30) },
                ]}
              />
            </div>
            <div>
              <div className="text-white/70 text-xs font-semibold mb-2">
                Cup &amp; Handle
              </div>
              <CupHandleTimeline pattern={cup?.pattern} />
            </div>
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div className="px-3 pb-4 sm:px-4">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-white/80 text-xs font-semibold mb-2">
            Key metrics
          </div>

          {indicatorType === "macd" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="text-white/60">MACD Line</div>
              <div className="text-white font-mono">
                {formatNum(lastOf(macd?.macdLine), 4)}
              </div>
              <div className="text-white/60">Signal Line</div>
              <div className="text-white font-mono">
                {formatNum(lastOf(macd?.signalLine), 4)}
              </div>
              <div className="text-white/60">Histogram</div>
              <div className="text-white font-mono">
                {formatNum(lastOf(macd?.histogram), 4)}
              </div>
            </div>
          )}

          {indicatorType === "rsi" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="text-white/60">Current RSI</div>
              <div className="text-white font-mono">
                {formatNum(rsi?.currentValue, 2)}
              </div>
              <div className="text-white/60">Overbought</div>
              <div className="text-white font-mono">
                {formatNum(rsi?.overbought, 0)}
              </div>
              <div className="text-white/60">Oversold</div>
              <div className="text-white font-mono">
                {formatNum(rsi?.oversold, 0)}
              </div>
              <div className="text-white/60">Trend</div>
              <div className="text-white">{rsi?.trend || "—"}</div>
            </div>
          )}

          {indicatorType === "cuphandle" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="text-white/60">Detected</div>
              <div className="text-white">
                {cup?.pattern?.detected ? "Yes" : "No"}
              </div>
              <div className="text-white/60">Confidence</div>
              <div className="text-white font-mono">
                {typeof cup?.pattern?.confidence === "number"
                  ? `${cup.pattern.confidence.toFixed(2)}%`
                  : "—"}
              </div>
              <div className="text-white/60">Target</div>
              <div className="text-white font-mono">
                {formatNum(cup?.pattern?.targetPrice, 6)}
              </div>
            </div>
          )}

          {indicatorType === "all" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="text-white/60">RSI</div>
              <div className="text-white font-mono">
                {formatNum(rsi?.currentValue, 2)}
              </div>
              <div className="text-white/60">MACD Hist</div>
              <div className="text-white font-mono">
                {formatNum(lastOf(macd?.histogram), 4)}
              </div>
              <div className="text-white/60">Cup &amp; Handle</div>
              <div className="text-white">
                {cup?.pattern?.detected ? "Detected" : "Not detected"}
              </div>
            </div>
          )}
        </div>

        {analysis?.analysis && (
          <div className="mt-3 p-3">
            <div className="text-white/80 text-xs font-semibold mb-2">
              AI analysis
            </div>
            <div className="text-white/80 text-sm leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[
                  rehypeRaw,
                  [rehypeSanitize as any, sanitizeSchema as any],
                ]}
                components={markdownComponents as any}
              >
                {String(analysis.analysis).trim()}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TechnicalReportEmbed({ payload }: { payload: any }) {
  const reportText = String(
    payload?.report?.report || payload?.report || "",
  ).trim();
  const dexData =
    payload?.dexData ||
    payload?.tokenData?.dexData ||
    payload?.report?.tokenData?.dexData ||
    null;
  const holderAnalytics =
    payload?.holderAnalytics ||
    payload?.holdersData ||
    payload?.report?.holderAnalytics ||
    payload?.report?.holdersData ||
    null;
  const securityAnalytics =
    payload?.securityAnalytics ||
    payload?.securityData ||
    payload?.report?.securityAnalytics ||
    payload?.report?.securityData ||
    null;
  // Try multiple paths for tweetsData - could be in different locations
  const tweetsDataRaw =
    payload?.tweetsData ||
    payload?.tweets ||
    payload?.report?.tweetsData ||
    payload?.report?.tweets ||
    null;

  // Handle case where tweetsData might be wrapped in { success: true, data: [...] }
  // or could be directly an array
  let tweetsData: any[] | null = null;
  if (Array.isArray(tweetsDataRaw)) {
    // Direct array
    tweetsData = tweetsDataRaw;
  } else if (tweetsDataRaw && typeof tweetsDataRaw === "object") {
    // Check for nested data property (API response format)
    if (Array.isArray(tweetsDataRaw.data)) {
      tweetsData = tweetsDataRaw.data;
    } else if (Array.isArray(tweetsDataRaw.tweets)) {
      tweetsData = tweetsDataRaw.tweets;
    } else if (Array.isArray(tweetsDataRaw.tweetsData)) {
      tweetsData = tweetsDataRaw.tweetsData;
    }
    // If it's an object but not an array and doesn't have nested arrays, try to extract
    // This handles edge cases where data might be structured differently
  }

  // Final fallback: if we still don't have tweetsData, set to null
  if (!tweetsData) {
    tweetsData = null;
  }
  const chain =
    payload?.chain ||
    payload?.report?.chain ||
    payload?.metadata?.chain ||
    payload?.report?.metadata?.chain ||
    dexData?.chainId ||
    dexData?.chain ||
    "";
  const isBNBToken =
    typeof chain === "string" &&
    (chain.toLowerCase().includes("bsc") ||
      chain.toLowerCase().includes("bnb"));

  const tokenTitle =
    payload?.token?.symbol ||
    payload?.token?.name ||
    payload?.report?.ticker ||
    "Token";

  const tokenSymbol = payload?.token?.symbol || payload?.report?.ticker || "";
  const tokenName = payload?.token?.name || payload?.report?.projectName || "";
  const logo = payload?.token?.logo || dexData?.info?.imageUrl || null;
  const headerImage = dexData?.info?.header || null;
  const websites = dexData?.info?.websites || [];
  const socials = dexData?.info?.socials || [];
  const updatedIso =
    payload?.metadata?.generatedAt ||
    payload?.report?.metadata?.generatedAt ||
    payload?.report?.generatedAt ||
    null;

  const formatAbsolute = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `Updated on ${d.toLocaleDateString("en-US")} at ${d.toLocaleTimeString(
      "en-US",
      { hour: "2-digit", minute: "2-digit" },
    )}`;
  };

  if (!reportText) return null;

  function renderTweetsSection(): React.ReactNode {
    if (!tweetsData || !Array.isArray(tweetsData) || tweetsData.length === 0) {
      return (
        <div className="text-center py-6 sm:py-8 text-white/60">
          <div className="text-3xl sm:text-4xl mb-2">🐦</div>
          <p className="text-sm sm:text-base">
            No tweet data available for analysis
          </p>
        </div>
      );
    }

    return (
      // ✅ MOBILE: 1 column
      // ✅ DESKTOP: 2-column grid
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {tweetsData.map((tweet: any, idx: number) => {
          const tweeter = tweet.tweeter || {};
          const username = tweeter.userName || tweeter.username || "unknown";
          const displayName = tweeter.name || username;
          const profileImage = tweeter.publicImageUrl;
          const text = tweet.text || "";
          const isVerified = tweeter.isBlueVerified;
          const verifiedType = tweeter.verifiedType;
          const followers = tweeter.followers || 0;
          const location = tweeter.location;

          const formatNumber = (num: number) => {
            if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
            if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
            return num.toString();
          };

          const formatTimestamp = (timestamp: string) => {
            if (!timestamp) return "";
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);

            if (diffDays > 0) return `${diffDays}d`;
            if (diffHours > 0) return `${diffHours}h`;
            return "now";
          };

          return (
            <div
              key={tweet.id || idx}
              className="
              bg-black/20 
              rounded-lg 
              p-3 sm:p-4 md:p-5 
              border border-white/10 
              hover:border-blue-400/50 
              transition-colors
              h-fit
            "
            >
              <div className="flex items-start gap-3 md:gap-4">
                {/* Avatar */}
                <div className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full overflow-hidden flex-shrink-0 bg-blue-500 flex items-center justify-center">
                  {profileImage ? (
                    <Image
                      src={profileImage}
                      alt={displayName}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-sm font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex flex-col items-start gap-1 flex-wrap">
                        <div className="flex gap-2">
                          <span className="font-semibold text-white truncate">
                            {displayName}
                          </span>
                          {isVerified && (
                            <span
                              className="text-blue-400"
                              title={`Verified ${verifiedType || "account"}`}
                            >
                              {verifiedType === "Blue" ? "🔹" : "✓"}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 items-center">
                          <div className="">
                            <span className="text-white/50 text-sm truncate">
                              @{username}
                            </span>
                          </div>
                          {tweet.createdAt && (
                            <span className="text-white/40 text-sm">
                              · {formatTimestamp(tweet.createdAt)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-white/50 flex gap-2 flex-wrap mt-0.5">
                        {followers > 0 && (
                          <span>{formatNumber(followers)} followers</span>
                        )}
                        {location && <span>📍 {location}</span>}
                      </div>
                    </div>

                    {tweet.url && (
                      <a
                        href={tweet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 text-xs hover:text-blue-300 flex-shrink-0"
                      >
                        View →
                      </a>
                    )}
                  </div>

                  {/* Tweet text */}
                  <p className="text-white/90 text-sm sm:text-base leading-relaxed whitespace-pre-wrap mb-3">
                    {text}
                  </p>

                  {/* Media */}
                  {tweet.media?.mediaUrl && (
                    <Image
                      src={tweet.media.mediaPreview || tweet.media.mediaUrl}
                      alt="Tweet media"
                      width={400}
                      height={250}
                      className="rounded-md border border-white/10 w-full h-auto mb-3"
                    />
                  )}

                  {/* Metrics */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 text-xs text-white/60 pt-2 border-t border-white/10">
                    <span>💬 {formatNumber(tweet.replyCount || 0)}</span>
                    <span>🔄 {formatNumber(tweet.retweetCount || 0)}</span>
                    <span>❤️ {formatNumber(tweet.likeCount || 0)}</span>
                    {tweet.viewCount && (
                      <span>👁️ {formatNumber(tweet.viewCount)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderSectionContent(title: string, lines: string[]) {
    const t = title.toLowerCase();
    const body = lines.join("\n");

    if (t.includes("individual tweets")) {
      return renderTweetsSection();
    }

    if (t.includes("coin-o-metry")) {
      return dexData ? (
        <CoinOMetry dexData={dexData} />
      ) : (
        renderMarkdownSection(body)
      );
    }

    if (t.includes("safety analytics")) {
      if (!isBNBToken) return "";
      return (
        <div className="space-y-6">
          {renderMarkdownSection(body)}
          {securityAnalytics && (
            <div className="mt-4">
              <BirdeyeSafetyAnalyticsComponent data={securityAnalytics} />
            </div>
          )}
        </div>
      );
    }

    if (t.includes("holder analytics")) {
      if (!isBNBToken) return "";
      return (
        <div className="space-y-6">
          {renderMarkdownSection(body)}
          {holderAnalytics && (
            <div className="mt-4">
              <HolderAnalyticsComponent data={holderAnalytics} />
            </div>
          )}
        </div>
      );
    }

    return renderMarkdownSection(body);
  }

  function formatStructuredReport(text: string): React.ReactNode {
    const lines = text.split("\n");
    let cur = "";
    const sections: Record<string, string[]> = {};

    lines.forEach((line) => {
      if (line.startsWith("## ")) {
        const raw = line.substring(3).trim();
        cur = raw.replace(/^\d+\.\s*/, "");
        sections[cur] = [];
      } else if (cur && line.trim()) {
        sections[cur].push(line);
      }
    });

    return (
      <div className="space-y-8">
        {Object.entries(sections).map(([title, body], i) => {
          const lowerTitle = title.toLowerCase();
          if (
            !isBNBToken &&
            (lowerTitle.includes("holder analytics") ||
              lowerTitle.includes("safety analytics"))
          ) {
            return null;
          }
          return (
            <div key={i}>
              <h2 className="text-[#ffc000] mb-4 flex items-center gap-3">
                {title}
                <span>{getSectionIcon(title)}</span>
              </h2>
              <div className="space-y-3">
                {renderSectionContent(title, body)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="px-3 py-4 sm:px-4">
        <div className="flex flex-col w-full justify-center items-center gap-4">
          <div className="flex items-center gap-4">
            {logo && (
              <Image
                src={logo}
                alt="Token Logo"
                width={30}
                height={30}
                className="rounded-full border border-white/10"
              />
            )}
            <div className="text-center">
              <div className="text-white text-[22px] sm:text-[28px] leading-tight">
                {tokenSymbol || tokenTitle} {tokenName ? `(${tokenName})` : ""}
              </div>
              <div className="text-white/60 text-xs mt-1">Technical Report</div>
            </div>
          </div>

          {updatedIso && (
            <div className="text-sm text-white/60 -mt-2 text-center w-full">
              {formatAbsolute(updatedIso)}
            </div>
          )}

          <div className="flex flex-col gap-4 items-center">
            {headerImage && (
              <Image
                src={headerImage}
                alt="Header"
                width={200}
                height={60}
                className="rounded-lg border border-white/10 object-cover"
              />
            )}

            <div className="flex flex-row justify-center w-full gap-8 mt-1">
              {websites?.[0]?.url && (
                <a
                  href={websites[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/60 hover:text-white transition"
                  title={websites[0].label || "Website"}
                >
                  <Image
                    src={"/images/earth.png"}
                    alt="Website"
                    width={28}
                    height={25}
                  />
                </a>
              )}

              {socials?.map((s: any, idx: number) => {
                if (!s?.url) return null;
                const isX = s.type === "twitter";
                const isTg = s.type === "telegram";
                const icon = isX
                  ? "/images/x.png"
                  : isTg
                    ? "/images/telegram.png"
                    : null;
                if (!icon) return null;
                return (
                  <a
                    key={idx}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 hover:text-white transition"
                    title={s.type}
                  >
                    <Image
                      src={icon}
                      alt={`${s.type} icon`}
                      width={25}
                      height={25}
                    />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-4">{formatStructuredReport(reportText)}</div>
      </div>
    </div>
  );
}

export function CryptoTechnicalEmbed({ payload }: { payload: any }) {
  const kind = String(payload?.kind || "").toLowerCase();
  const hasReport =
    typeof payload?.report === "string" ||
    typeof payload?.report?.report === "string";

  if (kind === "technical_report" || hasReport) {
    return <TechnicalReportEmbed payload={payload} />;
  }

  return <IndicatorEmbed payload={payload} />;
}

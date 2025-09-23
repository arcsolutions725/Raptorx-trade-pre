/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/technical-analysis/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getDexscreenerData } from "@/lib/api/dexscreener";

// Initialize Deepseek client
const deepseekClient = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Define indicator types
type IndicatorType = "macd" | "rsi" | "cuphandle" | "all";

// Rate limiting map
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Validate request and check rate limits
async function validateRequest(req: NextRequest, userId: string) {
  // Check rate limits
  const now = Date.now();
  const userRateData = rateLimitMap.get(userId) || { count: 0, timestamp: now };
  
  // Reset counter if window has passed
  if (now - userRateData.timestamp > RATE_WINDOW) {
    userRateData.count = 0;
    userRateData.timestamp = now;
  }
  
  // Check if rate limit exceeded
  if (userRateData.count >= RATE_LIMIT) {
    return {
      isValid: false,
      error: "Rate limit exceeded. Please try again later.",
      status: 429
    };
  }
  
  // Increment counter
  userRateData.count += 1;
  rateLimitMap.set(userId, userRateData);
  
  return { isValid: true };
}

// Mock TradingView API integration (to be replaced with actual implementation)
async function fetchTradingViewData(
  indicatorType: IndicatorType,
  tokenAddress: string,
  timeframe: string
) {
  console.log(`📊 Fetching ${indicatorType} data for ${tokenAddress} on ${timeframe} timeframe`);
  
  // Get token data from DexScreener for additional context
  const dexData = await getDexscreenerData(tokenAddress);
  
  // This would be replaced with actual TradingView API calls
  // For now, return mock data based on indicator type
  switch (indicatorType) {
    case "macd":
      return {
        indicator: "macd",
        tokenAddress,
        timeframe,
        dexData,
        chartData: {
          macdLine: [0.002, 0.001, -0.001, -0.002, -0.001, 0.001, 0.003],
          signalLine: [0.001, 0.001, 0.000, -0.001, -0.001, 0.000, 0.001],
          histogram: [0.001, 0.000, -0.001, -0.001, 0.000, 0.001, 0.002],
          crossovers: [
            { type: "bullish", position: 5 },
            { type: "bearish", position: 2 }
          ],
          settings: {
            fastLength: 12,
            slowLength: 26,
            signalSmoothing: 9
          }
        }
      };
      
    case "rsi":
      return {
        indicator: "rsi",
        tokenAddress,
        timeframe,
        dexData,
        chartData: {
          values: [45, 48, 52, 58, 62, 65, 60, 55, 50],
          overbought: 70,
          oversold: 30,
          currentValue: 50,
          trend: "neutral",
          divergences: [
            { type: "bullish", position: 2 },
            { type: "bearish", position: 6 }
          ],
          settings: {
            length: 14
          }
        }
      };
      
    case "cuphandle":
      return {
        indicator: "cuphandle",
        tokenAddress,
        timeframe,
        dexData,
        chartData: {
          pattern: {
            detected: Math.random() > 0.5,
            confidence: Math.random() * 100,
            cupStart: 10,
            cupEnd: 30,
            handleStart: 30,
            handleEnd: 40,
            targetPrice: dexData && !("error" in dexData) && dexData.priceUsd 
              ? parseFloat(dexData.priceUsd) * (1 + Math.random() * 0.3) 
              : 0
          },
          priceAction: {
            volume: "increasing",
            consolidation: true
          }
        }
      };
      
    case "all":
      // Combine all indicators
      const macdData: any = await fetchTradingViewData("macd", tokenAddress, timeframe);
      const rsiData: any = await fetchTradingViewData("rsi", tokenAddress, timeframe);
      const cupHandleData: any = await fetchTradingViewData("cuphandle", tokenAddress, timeframe);
      
      return {
        indicator: "all",
        tokenAddress,
        timeframe,
        dexData,
        chartData: {
          macd: macdData.chartData,
          rsi: rsiData.chartData,
          cuphandle: cupHandleData.chartData
        }
      };
      
    default:
      throw new Error(`Unsupported indicator type: ${indicatorType}`);
  }
}

// Generate AI analysis using Deepseek
async function generateAnalysis(indicatorData: any): Promise<ReadableStream> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("Deepseek API key not configured");
  }

  const prompt = createAnalysisPrompt(indicatorData);
  const systemPrompt = 
    "You are a professional cryptocurrency technical analyst specializing in chart patterns and technical indicators. Provide detailed, accurate analysis of trading indicators with actionable insights.";

  try {
    // Create a streaming completion request
    const response = await deepseekClient.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      stream: true,
    });

    // Create a TransformStream to process the streaming response
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const decoded = decoder.decode(chunk);
        controller.enqueue(encoder.encode(decoded));
      },
    });

    // Process the stream
    const responseStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const delta = chunk.choices?.[0]?.delta?.content || "";
          if (delta) {
            controller.enqueue(encoder.encode(delta));
          }
        }
        controller.close();
      },
    });

    // Pipe through the transform stream
    return responseStream.pipeThrough(transformStream);
  } catch (error: any) {
    console.error("Deepseek API Error:", error.response?.data || error.message);
    throw new Error("Failed to generate AI analysis");
  }
}

// Create prompt for Deepseek analysis
function createAnalysisPrompt(data: any): string {
  const { indicator, tokenAddress, timeframe, dexData, chartData } = data;
  
  // Format token info
  const tokenInfo = !dexData || "error" in dexData 
    ? "Token information not available."
    : `
    Token: ${dexData.baseToken.symbol}
    Price: ${dexData.priceUsd || "Unknown"}
    24h Change: ${dexData.priceChange?.h24 ? `${dexData.priceChange.h24.toFixed(2)}%` : "Unknown"}
    24h Volume: ${dexData.volume?.h24 ? `$${dexData.volume.h24.toLocaleString()}` : "Unknown"}
    Market Cap: ${dexData.marketCap ? `$${dexData.marketCap.toLocaleString()}` : "Unknown"}
    `;

  // Base prompt for all indicators
  let prompt = `
  Generate a detailed technical analysis for the following cryptocurrency:
  
  ## Token Information
  ${tokenInfo}
  Contract Address: ${tokenAddress}
  Timeframe: ${timeframe}
  
  `;
  
  // Add indicator-specific data
  if (indicator === "macd" || indicator === "all") {
    const macdData = indicator === "macd" ? chartData : chartData.macd;
    prompt += `
    ## MACD Analysis
    MACD Line: ${JSON.stringify(macdData.macdLine)}
    Signal Line: ${JSON.stringify(macdData.signalLine)}
    Histogram: ${JSON.stringify(macdData.histogram)}
    Crossovers: ${JSON.stringify(macdData.crossovers)}
    Settings: Fast Length=${macdData.settings.fastLength}, Slow Length=${macdData.settings.slowLength}, Signal Smoothing=${macdData.settings.signalSmoothing}
    
    `;
  }
  
  if (indicator === "rsi" || indicator === "all") {
    const rsiData = indicator === "rsi" ? chartData : chartData.rsi;
    prompt += `
    ## RSI Analysis
    Current RSI: ${rsiData.currentValue}
    RSI Values: ${JSON.stringify(rsiData.values)}
    Overbought Level: ${rsiData.overbought}
    Oversold Level: ${rsiData.oversold}
    Current Trend: ${rsiData.trend}
    Divergences: ${JSON.stringify(rsiData.divergences)}
    Settings: Length=${rsiData.settings.length}
    
    `;
  }
  
  if (indicator === "cuphandle" || indicator === "all") {
    const cupHandleData = indicator === "cuphandle" ? chartData : chartData.cuphandle;
    prompt += `
    ## Cup and Handle Pattern Analysis
    Pattern Detected: ${cupHandleData.pattern.detected ? "Yes" : "No"}
    Confidence: ${cupHandleData.pattern.confidence.toFixed(2)}%
    Cup Range: ${cupHandleData.pattern.cupStart} to ${cupHandleData.pattern.cupEnd}
    Handle Range: ${cupHandleData.pattern.handleStart} to ${cupHandleData.pattern.handleEnd}
    Target Price: ${cupHandleData.pattern.targetPrice}
    Volume Trend: ${cupHandleData.priceAction.volume}
    Consolidation Phase: ${cupHandleData.priceAction.consolidation ? "Yes" : "No"}
    
    `;
  }
  
  // Add analysis instructions
  prompt += `
  ## Analysis Instructions
  
  1. Provide a detailed technical analysis based on the indicator data.
  2. Explain what the current indicator values suggest about market momentum and trend direction.
  3. Identify key levels, patterns, and signals that traders should watch.
  4. Provide a short-term outlook (next 24-48 hours) based on these indicators.
  5. Mention any potential trade setups or strategies based on the current technical picture.
  6. Include a confidence score (1-10) for your analysis.
  7. Format your response in clear, concise paragraphs with headers for each section.
  
  Your analysis should be data-driven, objective, and avoid making exaggerated claims. Focus on what the technical indicators are showing, not speculative price predictions.
  `;
  
  return prompt;
}

// Main API handler
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { indicatorType, tokenAddress, timeframe = "15m", userId } = body;
    
    // Validate required fields
    if (!indicatorType || !tokenAddress || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: indicatorType, tokenAddress, userId" },
        { status: 400 }
      );
    }
    
    // Validate indicator type
    if (!["macd", "rsi", "cuphandle", "all"].includes(indicatorType)) {
      return NextResponse.json(
        { error: "Invalid indicator type. Must be one of: macd, rsi, cuphandle, all" },
        { status: 400 }
      );
    }
    
    // Validate user and check rate limits
    const validation = await validateRequest(request, userId);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }
    
    console.log(`🔍 Processing ${indicatorType} analysis for token: ${tokenAddress}`);
    
    // Fetch indicator data from TradingView
    const indicatorData = await fetchTradingViewData(
      indicatorType as IndicatorType,
      tokenAddress,
      timeframe
    );
    
    // Generate AI analysis using Deepseek
    const analysisStream = await generateAnalysis(indicatorData);
    
    // Create response with indicator data and analysis
    const responseData = {
      success: true,
      indicatorType,
      tokenAddress,
      timeframe,
      chartData: indicatorData.chartData,
      // Analysis will be streamed
    };
    
    // Prepare headers for streaming response
    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    };
    
    // Create a stream that first sends the indicator data, then the analysis
    const encoder = new TextEncoder();
    const dataPrefix = `data: ${JSON.stringify(responseData)}\n\n`;
    
    const combinedStream = new ReadableStream({
      async start(controller) {
        // First, send the indicator data
        controller.enqueue(encoder.encode(dataPrefix));
        
        // Then pipe the analysis stream
        const reader = analysisStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        
        controller.close();
      },
    });
    
    return new Response(combinedStream, { headers });
  } catch (error) {
    console.error("❌ Technical analysis API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate technical analysis",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

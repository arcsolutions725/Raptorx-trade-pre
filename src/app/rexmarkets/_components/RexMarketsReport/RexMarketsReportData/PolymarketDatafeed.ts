/* eslint-disable @typescript-eslint/no-explicit-any */
// Polymarket Datafeed implementation for historical price data

export class PolymarketDatafeed {
  private conditionId: string;
  private resolution: string;
  private lastBarTime: number | null = null;

  constructor(conditionId: string) {
    this.conditionId = conditionId;
    this.resolution = "60"; // Default 1 hour
  }

  async getBars(
    symbolInfo: any,
    resolution: string,
    from: number,
    to: number,
    onHistoryCallback: (bars: any[], noData?: { noData: boolean }) => void,
    onErrorCallback: (error: any) => void
  ) {
    try {
      this.resolution = resolution;
      
      // Convert resolution to minutes
      let resolutionMinutes = 60;
      if (resolution === "1") resolutionMinutes = 1;
      else if (resolution === "5") resolutionMinutes = 5;
      else if (resolution === "15") resolutionMinutes = 15;
      else if (resolution === "60") resolutionMinutes = 60;
      else if (resolution === "240") resolutionMinutes = 240;
      else if (resolution === "D") resolutionMinutes = 1440;
      else if (resolution === "W") resolutionMinutes = 10080;
      else if (resolution === "M") resolutionMinutes = 43200;

      const response = await fetch(
        `/api/polymarket/historical-data?condition_id=${this.conditionId}&from=${from}&to=${to}&resolution=${resolutionMinutes}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch historical data: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.s === "ok" && data.t && data.t.length > 0) {
        const bars = data.t.map((time: number, index: number) => ({
          time: time * 1000, // Convert to milliseconds
          open: data.o[index],
          high: data.h[index],
          low: data.l[index],
          close: data.c[index],
          volume: data.v[index],
        }));

        if (bars.length > 0) {
          this.lastBarTime = bars[bars.length - 1].time;
        }

        onHistoryCallback(bars, { noData: false });
      } else {
        onHistoryCallback([], { noData: true });
      }
    } catch (error) {
      console.error("Error fetching bars:", error);
      onErrorCallback(error);
    }
  }

  async subscribeBars(
    symbolInfo: any,
    resolution: string,
    onTick: (bar: any) => void,
    subscriberUID: string,
    onResetCacheNeededCallback: () => void
  ) {
    // Subscribe to real-time updates
    // For now, we'll poll every few seconds
    const interval = setInterval(async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 3600; // Last hour

        const response = await fetch(
          `/api/polymarket/historical-data?condition_id=${this.conditionId}&from=${from}&to=${now}&resolution=${this.resolution}`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.s === "ok" && data.t && data.t.length > 0) {
            const lastBar = {
              time: data.t[data.t.length - 1] * 1000,
              open: data.o[data.o.length - 1],
              high: data.h[data.h.length - 1],
              low: data.l[data.l.length - 1],
              close: data.c[data.c.length - 1],
              volume: data.v[data.v.length - 1],
            };

            if (!this.lastBarTime || lastBar.time > this.lastBarTime) {
              onTick(lastBar);
              this.lastBarTime = lastBar.time;
            }
          }
        }
      } catch (error) {
        console.error("Error in subscription:", error);
      }
    }, 5000); // Poll every 5 seconds

    // Return unsubscribe function
    return () => {
      clearInterval(interval);
    };
  }

  unsubscribeBars(subscriberUID: string) {
    // Cleanup handled by interval clear
  }
}


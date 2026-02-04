import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Side, OrderType } from "@polymarket/clob-client";
import type { ClobClient, UserOrder } from "@polymarket/clob-client";

export type OrderParams = {
  tokenId: string;
  size: number;
  price?: number;
  side: "BUY" | "SELL";
  negRisk?: boolean;
  isMarketOrder?: boolean;
};

export default function useClobOrder(
  clobClient: ClobClient | null,
  walletAddress: string | undefined
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const submitOrder = useCallback(
    async (params: OrderParams) => {
      if (!walletAddress) {
        throw new Error("Wallet not connected");
      }
      if (!clobClient) {
        throw new Error("CLOB client not initialized");
      }

      setIsSubmitting(true);
      setError(null);
      setOrderId(null);

      try {
        const side = params.side === "BUY" ? Side.BUY : Side.SELL;
        let response;

        if (params.isMarketOrder) {
          let aggressivePrice: number;

          try {
            const priceFromOrderbook = await clobClient.getPrice(
              params.tokenId,
              side
            );

            const marketPrice = parseFloat(priceFromOrderbook.price);

            if (isNaN(marketPrice) || marketPrice <= 0 || marketPrice >= 1) {
              throw new Error("Invalid price from orderbook");
            }

            if (params.side === "BUY") {
              aggressivePrice = Math.min(0.99, marketPrice * 1.05);
            } else {
              aggressivePrice = Math.max(0.01, marketPrice * 0.95);
            }
          } catch (e) {
            aggressivePrice = params.side === "BUY" ? 0.99 : 0.01;
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `Cannot get market price, using fallback: ${aggressivePrice}. Error:`,
                e instanceof Error ? e.message : "Unknown"
              );
            }
          }

          const limitOrder: UserOrder = {
            tokenID: params.tokenId,
            price: aggressivePrice,
            size: params.size,
            side,
            feeRateBps: 0,
            expiration: 0,
            taker: "0x0000000000000000000000000000000000000000",
          };

          response = await clobClient.createAndPostOrder(
            limitOrder,
            { negRisk: params.negRisk },
            OrderType.GTC
          );
        } else {
          if (!params.price) {
            throw new Error("Price required for limit orders");
          }

          const limitOrder: UserOrder = {
            tokenID: params.tokenId,
            price: params.price,
            size: params.size,
            side,
            feeRateBps: 0,
            expiration: 0,
            taker: "0x0000000000000000000000000000000000000000",
          };

          response = await clobClient.createAndPostOrder(
            limitOrder,
            { negRisk: params.negRisk },
            OrderType.GTC
          );
        }

        // Check if response has an error (ClobClient returns {error: "message"} on error)
        // The error can be a string or an object with nested error property
        if (response?.error) {
          let errorMessage: string;
          
          if (typeof response.error === "string") {
            errorMessage = response.error;
          } else if (response.error?.error) {
            // Nested error object: {error: {error: "message"}}
            errorMessage = typeof response.error.error === "string" 
              ? response.error.error 
              : JSON.stringify(response.error.error);
          } else if (typeof response.error === "object") {
            // Error is an object, try to extract message
            errorMessage = response.error.message || JSON.stringify(response.error);
          } else {
            errorMessage = String(response.error);
          }
          
          if (process.env.NODE_ENV !== "production") {
            console.error("[useClobOrder] Error in response:", errorMessage, response);
          }
          throw new Error(errorMessage);
        }

        // Check if response itself is an error object (no orderID and has error property)
        if (response && typeof response === "object" && !response.orderID && "error" in response) {
          let errorMessage: string;
          
          if (typeof response.error === "string") {
            errorMessage = response.error;
          } else if (response.error?.error) {
            errorMessage = typeof response.error.error === "string" 
              ? response.error.error 
              : JSON.stringify(response.error.error);
          } else {
            errorMessage = JSON.stringify(response.error);
          }
          
          if (process.env.NODE_ENV !== "production") {
            console.error("[useClobOrder] Response is error object:", errorMessage, response);
          }
          throw new Error(errorMessage);
        }

        if (response?.orderID) {
          setOrderId(response.orderID);
          queryClient.invalidateQueries({ queryKey: ["active-orders"] });
          queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
          return { success: true, orderId: response.orderID };
        } else {
          // If we get here, response doesn't have orderID and no error was detected
          if (process.env.NODE_ENV !== "production") {
            console.error("[useClobOrder] Unexpected response format:", response);
          }
          throw new Error("Order submission failed - unexpected response format");
        }
      } catch (err: any) {
        // Extract error message from API response
        // The ClobClient HTTP helpers return {error: "message"} instead of throwing
        // But errors can also come from axios or be thrown as Error objects
        let errorMessage = "Failed to submit order";
        
        // First check if it's an Error object with a message (most common case)
        if (err instanceof Error) {
          errorMessage = err.message;
        } 
        // Check if error is in response.data.error (axios error format)
        else if (err?.response?.data?.error) {
          errorMessage = typeof err.response.data.error === "string" 
            ? err.response.data.error 
            : JSON.stringify(err.response.data.error);
        } 
        // Check if response.data is an object with error property
        else if (err?.response?.data && typeof err.response.data === "object") {
          if (err.response.data.error) {
            errorMessage = typeof err.response.data.error === "string"
              ? err.response.data.error
              : JSON.stringify(err.response.data.error);
          } else {
            errorMessage = err.response.data.message || JSON.stringify(err.response.data);
          }
        } 
        // Check if response.data is a string (might be JSON)
        else if (err?.response?.data && typeof err.response.data === "string") {
          try {
            const parsed = JSON.parse(err.response.data);
            errorMessage = parsed.error || parsed.message || errorMessage;
          } catch {
            errorMessage = err.response.data;
          }
        } 
        // Check if error is directly in data property
        else if (err?.data?.error) {
          errorMessage = typeof err.data.error === "string" ? err.data.error : JSON.stringify(err.data.error);
        } 
        // Check if error is directly in error property
        else if (err?.error) {
          errorMessage = typeof err.error === "string" ? err.error : JSON.stringify(err.error);
        } 
        // Check if error has a message property
        else if (err?.message) {
          errorMessage = err.message;
        } 
        // Check if error is a string
        else if (typeof err === "string") {
          errorMessage = err;
        }
        
        if (process.env.NODE_ENV !== "production") {
          console.error("[useClobOrder] Order submission error:", {
            error: err,
            errorType: typeof err,
            isError: err instanceof Error,
            extractedMessage: errorMessage,
            responseData: err?.response?.data,
          });
        }
        
        const error = new Error(errorMessage);
        setError(error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [clobClient, walletAddress, queryClient]
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!clobClient) {
        throw new Error("CLOB client not initialized");
      }

      setIsSubmitting(true);
      setError(null);

      try {
        await clobClient.cancelOrder({ orderID: orderId });
        queryClient.invalidateQueries({ queryKey: ["active-orders"] });
        return { success: true };
      } catch (err: any) {
        // Extract error message from API response
        let errorMessage = "Failed to cancel order";
        
        if (err?.response?.data?.error) {
          errorMessage = err.response.data.error;
        } else if (err?.response?.data && typeof err.response.data === "object") {
          errorMessage = err.response.data.error || err.response.data.message || JSON.stringify(err.response.data);
        } else if (err?.response?.data && typeof err.response.data === "string") {
          try {
            const parsed = JSON.parse(err.response.data);
            errorMessage = parsed.error || parsed.message || errorMessage;
          } catch {
            errorMessage = err.response.data;
          }
        } else if (err?.data?.error) {
          errorMessage = err.data.error;
        } else if (err?.error) {
          errorMessage = typeof err.error === "string" ? err.error : JSON.stringify(err.error);
        } else if (err?.message) {
          errorMessage = err.message;
        } else if (typeof err === "string") {
          errorMessage = err;
        }
        
        if (process.env.NODE_ENV !== "production") {
          console.error("[useClobOrder] Order cancellation error:", {
            error: err,
            extractedMessage: errorMessage,
          });
        }
        
        const error = new Error(errorMessage);
        setError(error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [clobClient, queryClient]
  );

  return {
    submitOrder,
    cancelOrder,
    isSubmitting,
    error,
    orderId,
  };
}

import { useQuery } from "@tanstack/react-query";

export type DepositAddresses = {
  evm: string;
  svm: string;
  btc: string;
};

type DepositAddressResponse = {
  address: DepositAddresses;
  note: string;
};

type UsePolymarketDepositAddressesParams = {
  walletAddress?: string | null;
  enabled?: boolean;
};

export function usePolymarketDepositAddresses({
  walletAddress,
  enabled = true,
}: UsePolymarketDepositAddressesParams) {
  return useQuery({
    queryKey: ["polymarket-deposit-addresses", walletAddress],
    queryFn: async (): Promise<DepositAddressResponse | null> => {
      if (!walletAddress) return null;

      const res = await fetch("/api/polymarket/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: walletAddress,
        }),
        cache: "no-store",
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Deposit addresses fetch error:", errorText);
        throw new Error(
          `Failed to fetch deposit addresses: ${res.status} ${errorText}`
        );
      }

      const data = await res.json();
      return data;
    },
    enabled: enabled && !!walletAddress,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });
}


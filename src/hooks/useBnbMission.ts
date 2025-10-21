import { useState, useEffect, useCallback } from "react";
import type { BnbMissionStatus } from "@/app/api/bnb-mission/route";

export function useBnbMission(userId: string) {
    const [mission, setMission] = useState<BnbMissionStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMission = useCallback(async () => {
        if (!userId) return;

        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/bnb-mission", {
                headers: { "x-user-id": userId },
            });

            if (response.ok) {
                const data = await response.json();
                setMission(data.mission);
            } else {
                setError("Failed to fetch BNB mission");
            }
        } catch (err) {
            console.error("BNB mission error:", err);
            setError("Failed to fetch BNB mission");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    const connectWallet = useCallback(async (walletAddress: string) => {
        if (!userId) return { success: false, error: "No user ID" };

        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/bnb-mission", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userId,
                },
                body: JSON.stringify({
                    action: "connect_wallet",
                    walletAddress,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // Refresh mission status
                await fetchMission();
                return { success: true, data };
            } else {
                setError(data.error || "Failed to connect wallet");
                return { success: false, error: data.error };
            }
        } catch (err) {
            console.error("Connect wallet error:", err);
            const errorMsg = "Failed to connect wallet";
            setError(errorMsg);
            return { success: false, error: errorMsg };
        } finally {
            setLoading(false);
        }
    }, [userId, fetchMission]);

    const completeSignature = useCallback(async (signature: string) => {
        if (!userId) return { success: false, error: "No user ID" };

        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/bnb-mission", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userId,
                },
                body: JSON.stringify({
                    action: "complete_signature",
                    signature,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // Refresh mission status
                await fetchMission();
                return { success: true, data };
            } else {
                setError(data.error || "Failed to complete signature");
                return { success: false, error: data.error };
            }
        } catch (err) {
            console.error("Complete signature error:", err);
            const errorMsg = "Failed to complete signature";
            setError(errorMsg);
            return { success: false, error: errorMsg };
        } finally {
            setLoading(false);
        }
    }, [userId, fetchMission]);

    useEffect(() => {
        if (userId) {
            fetchMission();
        }
    }, [userId, fetchMission]);

    return {
        mission,
        loading,
        error,
        refresh: fetchMission,
        connectWallet,
        completeSignature,
    };
}
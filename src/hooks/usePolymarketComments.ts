import { useQuery } from "@tanstack/react-query";

export type PolymarketComment = {
  id: string;
  body: string;
  parentEntityType: string;
  parentEntityID: number;
  userAddress: string;
  createdAt: string;
  updatedAt: string;
  parentCommentID?: string;
  replyAddress?: string;
  profile?: {
    name?: string;
    pseudonym?: string;
    displayUsernamePublic?: boolean;
    bio?: string;
    proxyWallet?: string;
    baseAddress?: string;
    profileImage?: string;
    positions?: Array<{
      tokenId: string;
      positionSize: string;
    }>;
  };
  reportCount?: number;
  reactionCount?: number;
  reactions?: Array<{
    id: string;
    commentID: string;
    reactionType: string;
    userAddress: string;
    profile?: {
      proxyWallet?: string;
    };
  }>;
};

type UsePolymarketCommentsParams = {
  marketId?: string | null;
  eventId?: string | null;
  seriesId?: string | null;
  parentEntityType?: "Event" | "Series" | "Market";
  limit?: number;
  offset?: number;
  order?: "createdAt" | "updatedAt";
  ascending?: boolean;
  holdersOnly?: boolean;
};

export function usePolymarketComments({
  marketId,
  eventId,
  seriesId,
  parentEntityType,
  limit = 40,
  offset = 0,
  order = "createdAt",
  ascending = false,
  holdersOnly = false,
}: UsePolymarketCommentsParams) {
  // Determine entity ID and parent entity type based on series_id
  // If series_id is not null: parent_entity_type=Series, parent_entity_id=series_id
  // If series_id is null: parent_entity_type=Event, parent_entity_id=event_id
  const finalParentEntityType = seriesId ? "Series" : (parentEntityType || "Event");
  const entityId = seriesId || eventId || marketId;
  
  return useQuery({
    queryKey: ["polymarket-comments", entityId, finalParentEntityType, limit, offset, order, ascending, holdersOnly],
    queryFn: async () => {
      if (!entityId) return null;

      const params = new URLSearchParams({
        ascending: ascending.toString(),
        holders_only: holdersOnly.toString(),
        order: order,
        limit: limit.toString(),
        offset: offset.toString(),
        get_positions: "true",
        get_reports: "true",
        parent_entity_type: finalParentEntityType,
      });

      // Use series_id if provided, otherwise use event_id, otherwise use market_id for backward compatibility
      if (seriesId) {
        params.set("series_id", seriesId);
      } else if (eventId) {
        params.set("event_id", eventId);
      } else if (marketId) {
        params.set("market_id", marketId);
      }

      const res = await fetch(
        `/api/polymarket/comments?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Comments fetch error:", errorText);
        throw new Error(`Failed to fetch comments: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!entityId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}


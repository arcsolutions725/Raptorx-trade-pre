"use client";

import { useQuery } from "@tanstack/react-query";

export type LimitlessTagGroup = {
  name: string;
  paramKey: string;
  tags: { name: string; paramValue: string }[];
};

export function useLimitlessTagGroups(categoryId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ["limitless-tag-groups", categoryId],
    enabled: !!categoryId && enabled,
    queryFn: async () => {
      if (!categoryId) return { tagGroups: [] };
      const res = await fetch(
        `/api/limitless/tag-groups?categoryId=${encodeURIComponent(categoryId)}`,
        { method: "GET", cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch tag groups");
      const data = await res.json();
      return data as { tagGroups: LimitlessTagGroup[] };
    },
    staleTime: 1000 * 60 * 5,
  });
}

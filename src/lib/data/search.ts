"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { ENTRY_SELECT, normalizeEntry } from "@/lib/data/entries";
import type { Entry, EntryKind } from "@/lib/types";

export interface SearchParams {
  q: string;
  kinds: EntryKind[];
  collection: string | null;
  tag: string | null;
  favorites: boolean;
  archived: boolean;
  range: "any" | "today" | "week" | "month" | "year";
}

function rangeStart(range: SearchParams["range"]) {
  switch (range) {
    case "today": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "week":
      return new Date(Date.now() - 7 * 864e5).toISOString();
    case "month":
      return new Date(Date.now() - 30 * 864e5).toISOString();
    case "year":
      return new Date(Date.now() - 365 * 864e5).toISOString();
    default:
      return null;
  }
}

export function hasSearchCriteria(p: SearchParams) {
  return !!(p.q.trim() || p.kinds.length || p.collection || p.tag || p.favorites || p.archived || p.range !== "any");
}

export function useSearch(params: SearchParams) {
  return useQuery({
    queryKey: ["search", params],
    enabled: hasSearchCriteria(params),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await createClient()
        .rpc("search_entries", {
          q: params.q.trim() || null,
          kinds: params.kinds.length ? params.kinds : null,
          collection: params.collection,
          tag: params.tag,
          favorites_only: params.favorites,
          include_archived: params.archived,
          date_from: rangeStart(params.range),
        })
        .select(ENTRY_SELECT)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as Parameters<typeof normalizeEntry>[0][]).map(normalizeEntry) as Entry[];
    },
  });
}

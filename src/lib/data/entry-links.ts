"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { EntryRow } from "@/lib/types";
import { useUser } from "@/lib/user-context";
import { hostname } from "@/lib/utils";

const IDEA_FIELDS = "id,title,body,url,kind,link_preview";
export type IdeaSummary = Pick<EntryRow, "id" | "title" | "body" | "url" | "kind" | "link_preview">;

export function ideaLabel(idea: IdeaSummary) {
  return idea.title || idea.link_preview?.title || idea.body?.trim().split("\n")[0] || hostname(idea.url) || "Untitled idea";
}

export function useLinkedIdeas(entryId: string) {
  const { id: userId } = useUser();
  return useQuery({
    queryKey: ["entry-links", userId, entryId],
    queryFn: async () => {
      const db = createClient();
      const [forward, reverse] = await Promise.all([
        db.from("entry_links").select(`idea:entries!entry_links_b_fk(${IDEA_FIELDS})`).eq("entry_a", entryId),
        db.from("entry_links").select(`idea:entries!entry_links_a_fk(${IDEA_FIELDS})`).eq("entry_b", entryId),
      ]);
      if (forward.error || reverse.error) throw forward.error || reverse.error;
      const rows = [...(forward.data ?? []), ...(reverse.data ?? [])] as unknown as { idea: IdeaSummary | null }[];
      return rows.flatMap(({ idea }) => idea ? [idea] : []).sort((a, b) => ideaLabel(a).localeCompare(ideaLabel(b)));
    },
  });
}

export function useLinkCandidates(entryId: string, search: string) {
  const { id: userId } = useUser();
  return useQuery({
    queryKey: ["entry-links", "candidates", userId, entryId, search],
    queryFn: async ({ signal }) => {
      const { data, error } = await createClient()
        .rpc("search_entries", { q: search || null, include_archived: false })
        // PostgREST needs the columns used to filter and order this RPC result.
        .select(`${IDEA_FIELDS},user_id,created_at`)
        .eq("user_id", userId)
        .neq("id", entryId)
        .order("created_at", { ascending: false })
        .limit(40)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as IdeaSummary[];
    },
  });
}

export async function setIdeaLink(userId: string, id: string, otherId: string, linked: boolean) {
  if (id === otherId) throw new Error("Choose a different idea.");
  const [entry_a, entry_b] = [id, otherId].sort();
  const table = createClient().from("entry_links");
  const { error } = linked
    ? await table.upsert({ user_id: userId, entry_a, entry_b }, { onConflict: "user_id,entry_a,entry_b", ignoreDuplicates: true })
    : await table.delete().eq("user_id", userId).eq("entry_a", entry_a).eq("entry_b", entry_b);
  if (error) throw error;
}

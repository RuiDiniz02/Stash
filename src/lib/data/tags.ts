"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tag } from "@/lib/types";

export function normalizeTagName(name: string) {
  return name.trim().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 50);
}

/** Returns tag rows for the given names, creating missing ones. */
export async function ensureTags(userId: string, names: string[]): Promise<Tag[]> {
  const supabase = createClient();
  const clean = Array.from(
    new Map(names.map(normalizeTagName).filter(Boolean).map((n) => [n.toLowerCase(), n])).values(),
  );
  if (!clean.length) return [];

  const { data: existing, error } = await supabase.from("tags").select("id,name");
  if (error) throw error;
  const byLower = new Map((existing ?? []).map((t) => [String(t.name).toLowerCase(), t as Tag]));
  const missing = clean.filter((n) => !byLower.has(n.toLowerCase()));

  if (missing.length) {
    const { data: created, error: insErr } = await supabase
      .from("tags")
      .insert(missing.map((name) => ({ name, user_id: userId })))
      .select("id,name");
    if (insErr) throw insErr;
    (created ?? []).forEach((t) => byLower.set(String(t.name).toLowerCase(), t as Tag));
  }
  return clean.map((n) => byLower.get(n.toLowerCase())).filter((t): t is Tag => !!t);
}

export interface TagWithCount extends Tag {
  count: number;
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await createClient().from("tags").select("id,name,entry_tags(count)").order("name");
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        count: (t.entry_tags as unknown as { count: number }[])?.[0]?.count ?? 0,
      })) as TagWithCount[];
    },
  });
}

export async function deleteTag(id: string) {
  const { error } = await createClient().from("tags").delete().eq("id", id);
  if (error) throw error;
}

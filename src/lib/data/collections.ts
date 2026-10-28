"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { invalidateData } from "@/lib/data/keys";
import type { Collection } from "@/lib/types";

export const SUGGESTED_COLLECTIONS: { name: string; icon: string; color: string }[] = [
  { name: "Photography", icon: "camera", color: "amber" },
  { name: "Video inspiration", icon: "film", color: "rose" },
  { name: "Design", icon: "palette", color: "violet" },
  { name: "Work", icon: "briefcase", color: "blue" },
  { name: "Travel", icon: "plane", color: "teal" },
  { name: "Personal ideas", icon: "lightbulb", color: "orange" },
  { name: "To-do", icon: "check-square", color: "green" },
  { name: "Websites & resources", icon: "globe", color: "indigo" },
];

export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("collections")
        .select("*,entry_collections(count)")
        .order("position")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((c) => {
        const { entry_collections, ...rest } = c as Collection & { entry_collections: { count: number }[] };
        return { ...rest, entry_count: entry_collections?.[0]?.count ?? 0 } as Collection;
      });
    },
  });
}

export function useCollectionMutations(userId: string) {
  const qc = useQueryClient();
  const done = () => invalidateData(qc);
  const supabase = createClient();

  const create = useMutation({
    mutationFn: async (input: { name: string; icon?: string | null; color?: string | null }[]) => {
      const last = (qc.getQueryData<Collection[]>(["collections"]) ?? []).reduce((m, c) => Math.max(m, c.position), -1);
      const { data, error } = await supabase
        .from("collections")
        .insert(
          input.map((c, i) => ({
            user_id: userId,
            name: c.name.trim(),
            icon: c.icon ?? null,
            color: c.color ?? null,
            position: last + 1 + i,
          })),
        )
        .select("*");
      if (error) throw error;
      return data as Collection[];
    },
    onSettled: done,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Collection, "name" | "icon" | "color">> }) => {
      const { error } = await supabase.from("collections").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: done,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("collections").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: done,
  });

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, position) => supabase.from("collections").update({ position }).eq("id", id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onMutate: (orderedIds) => {
      qc.setQueryData<Collection[]>(["collections"], (list) => {
        if (!list) return list;
        const byId = new Map(list.map((c) => [c.id, c]));
        return orderedIds.flatMap((id, position) => {
          const c = byId.get(id);
          return c ? [{ ...c, position }] : [];
        });
      });
    },
    onSettled: done,
  });

  return { create, update, remove, reorder };
}

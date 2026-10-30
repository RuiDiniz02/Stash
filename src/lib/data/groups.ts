"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { invalidateData } from "@/lib/data/keys";
import { toastWithUndo } from "@/lib/undo";
import { uuid } from "@/lib/utils";
import type { Entry, EntryGroup } from "@/lib/types";

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("entry_groups")
        .select("id,title,created_at,entries(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((g) => ({
        id: g.id as string,
        title: g.title as string,
        created_at: g.created_at as string,
        entry_count: (g.entries as unknown as { count: number }[])?.[0]?.count ?? 0,
      })) as EntryGroup[];
    },
  });
}

type Snapshot = { entryGroup: Map<string, string | null>; groups: Pick<EntryGroup, "id" | "title">[] };

/**
 * Group commands. Entries only ever point at a group, so grouping never copies content.
 * A database trigger removes a group when its last entry leaves; undo recreates it.
 */
export function useGroupCommands(userId: string) {
  const qc = useQueryClient();
  const supabase = createClient();
  const refresh = () => invalidateData(qc);

  const snapshot = (entries: Pick<Entry, "id" | "group_id">[]): Snapshot => {
    const groups = qc.getQueryData<EntryGroup[]>(["groups"]) ?? [];
    const touched = new Set(entries.map((e) => e.group_id).filter(Boolean));
    return {
      entryGroup: new Map(entries.map((e) => [e.id, e.group_id])),
      groups: groups.filter((g) => touched.has(g.id)).map(({ id, title }) => ({ id, title })),
    };
  };

  /** Puts entries back into the groups they were in, recreating groups that were removed. */
  const restore = async (snap: Snapshot) => {
    if (snap.groups.length) {
      await supabase
        .from("entry_groups")
        .upsert(snap.groups.map((g) => ({ ...g, user_id: userId })), { onConflict: "id", ignoreDuplicates: true });
    }
    const byGroup = new Map<string | null, string[]>();
    for (const [entryId, groupId] of snap.entryGroup) byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), entryId]);
    for (const [groupId, ids] of byGroup) await supabase.from("entries").update({ group_id: groupId }).in("id", ids);
    await refresh();
  };

  const assign = async (ids: string[], groupId: string | null) => {
    const { error } = await supabase.from("entries").update({ group_id: groupId }).in("id", ids);
    if (error) throw error;
  };

  return {
    async create(title: string, entries: Pick<Entry, "id" | "group_id">[]) {
      const snap = snapshot(entries);
      const id = uuid();
      const { error } = await supabase.from("entry_groups").insert({ id, user_id: userId, title: title.trim() });
      if (error) throw error;
      await assign(entries.map((e) => e.id), id);
      await refresh();
      toastWithUndo(`Grouped ${entries.length} entries`, async () => {
        await restore(snap);
        await supabase.from("entry_groups").delete().eq("id", id);
        await refresh();
      });
      return id;
    },

    async add(group: Pick<EntryGroup, "id" | "title">, entries: Pick<Entry, "id" | "group_id">[]) {
      const snap = snapshot(entries);
      await assign(entries.map((e) => e.id), group.id);
      await refresh();
      toastWithUndo(entries.length === 1 ? `Added to ${group.title}` : `${entries.length} entries added to ${group.title}`, () =>
        restore(snap),
      );
    },

    async removeEntries(entries: Pick<Entry, "id" | "group_id">[]) {
      const snap = snapshot(entries);
      await assign(entries.map((e) => e.id), null);
      await refresh();
      toastWithUndo(entries.length === 1 ? "Removed from group" : `${entries.length} entries removed from group`, () => restore(snap));
    },

    async rename(groupId: string, title: string) {
      const { error } = await supabase.from("entry_groups").update({ title: title.trim() }).eq("id", groupId);
      if (error) throw error;
      await refresh();
    },

    /** Dissolves the group; its entries stay in the Inbox exactly as they were. */
    async ungroup(group: Pick<EntryGroup, "id" | "title">) {
      const { data, error } = await supabase.from("entries").select("id").eq("group_id", group.id);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.id as string);
      await supabase.from("entry_groups").delete().eq("id", group.id);
      await refresh();
      toastWithUndo(`Ungrouped ${group.title}`, () =>
        restore({ entryGroup: new Map(ids.map((id) => [id, group.id])), groups: [{ id: group.id, title: group.title }] }),
      );
    },
  };
}

/** Suggested title for a new group, from the first entry that has something readable. */
export function suggestGroupTitle(entries: Entry[]) {
  for (const e of entries) {
    const text = e.title || e.link_preview?.title || e.body?.split("\n")[0];
    if (text?.trim()) return text.trim().slice(0, 60);
  }
  return "New group";
}

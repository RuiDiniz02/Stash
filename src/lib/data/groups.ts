"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { removeEntriesFromCollection } from "@/lib/data/collections";
import { invalidateData } from "@/lib/data/keys";
import { toastWithUndo } from "@/lib/undo";
import { uuid } from "@/lib/utils";
import type { Collection, Entry, EntryGroup } from "@/lib/types";

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("entry_groups")
        .select("id,title,collection_id,created_at,entries(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((g) => ({
        id: g.id as string,
        title: g.title as string,
        collection_id: (g.collection_id as string | null) ?? null,
        created_at: g.created_at as string,
        entry_count: (g.entries as unknown as { count: number }[])?.[0]?.count ?? 0,
      })) as EntryGroup[];
    },
  });
}

type GroupRef = Pick<EntryGroup, "id" | "title" | "collection_id">;
type Snapshot = { entryGroup: Map<string, string | null>; groups: GroupRef[] };

/** Finds the user's collection with this name (case-insensitive) or creates it. */
async function ensureCollection(userId: string, name: string, known: Collection[] | undefined) {
  const supabase = createClient();
  const list =
    known ??
    (((await supabase.from("collections").select("id,name,position")).data ?? []) as Pick<Collection, "id" | "name" | "position">[]);
  const existing = list.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return { id: existing.id, created: false };
  const position = list.reduce((m, c) => Math.max(m, c.position ?? 0), -1) + 1;
  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: userId, name: name.trim(), icon: "folder", color: "indigo", position })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, created: true };
}

/**
 * Group commands. Entries only ever point at a group, so grouping never copies content.
 * A named group is mirrored into a collection with the same name; the database keeps that
 * collection's entries in step with the group. A trigger removes a group once it is empty.
 */
export function useGroupCommands(userId: string) {
  const qc = useQueryClient();
  const supabase = createClient();
  const refresh = () => invalidateData(qc);
  const cachedGroups = () => qc.getQueryData<EntryGroup[]>(["groups"]) ?? [];
  const cachedCollections = () => qc.getQueryData<Collection[]>(["collections"]);

  const snapshot = (entries: Pick<Entry, "id" | "group_id">[]): Snapshot => {
    const touched = new Set(entries.map((e) => e.group_id).filter(Boolean));
    return {
      entryGroup: new Map(entries.map((e) => [e.id, e.group_id])),
      groups: cachedGroups()
        .filter((g) => touched.has(g.id))
        .map(({ id, title, collection_id }) => ({ id, title, collection_id })),
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

  const createGroup = async (title: string, entries: Pick<Entry, "id" | "group_id">[], named: boolean) => {
    const snap = snapshot(entries);
    const collection = named ? await ensureCollection(userId, title, cachedCollections()) : null;
    const id = uuid();
    const { error } = await supabase
      .from("entry_groups")
      .insert({ id, user_id: userId, title: title.trim(), collection_id: collection?.id ?? null });
    if (error) throw error;
    await assign(entries.map((e) => e.id), id);
    await refresh();
    const undo = async () => {
      await restore(snap);
      await supabase.from("entry_groups").delete().eq("id", id);
      if (collection?.created) await supabase.from("collections").delete().eq("id", collection.id);
      else if (collection) await removeEntriesFromCollection(entries.map((e) => e.id), collection.id);
      await refresh();
    };
    return { id, undo };
  };

  return {
    /** Group with a chosen name: also saved as a collection. */
    async create(title: string, entries: Pick<Entry, "id" | "group_id">[]) {
      const { id, undo } = await createGroup(title, entries, true);
      toastWithUndo(`Grouped ${entries.length} entries · added to Collections`, undo);
      return id;
    },

    /** Group made by dropping one entry on another; it gets a name (and a collection) when renamed. */
    async createFromDrop(title: string, entries: Pick<Entry, "id" | "group_id">[]) {
      const { id, undo } = await createGroup(title, entries, false);
      toastWithUndo("Group created — give it a name", undo);
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

    /**
     * Names the group and keeps its collection in step: links to an existing collection with that
     * name, renames the linked one, or creates a new collection.
     */
    async rename(groupId: string, title: string) {
      const name = title.trim();
      const group = cachedGroups().find((g) => g.id === groupId);
      const collections = cachedCollections();
      const sameName = collections?.find((c) => c.name.toLowerCase() === name.toLowerCase());
      let linkedNow = false;

      if (group?.collection_id && (!sameName || sameName.id === group.collection_id)) {
        const { error } = await supabase.from("collections").update({ name }).eq("id", group.collection_id);
        if (error) throw error;
      } else {
        const { id } = sameName ? { id: sameName.id } : await ensureCollection(userId, name, collections);
        const { error } = await supabase.from("entry_groups").update({ collection_id: id }).eq("id", groupId);
        if (error) throw error;
        linkedNow = !group?.collection_id;
      }

      const { error } = await supabase.from("entry_groups").update({ title: name }).eq("id", groupId);
      if (error) throw error;
      await refresh();
      return { linkedNow };
    },

    /** Dissolves the group; its entries stay in the Inbox and its collection is kept. */
    async ungroup(group: GroupRef) {
      const { data, error } = await supabase.from("entries").select("id").eq("group_id", group.id);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.id as string);
      await supabase.from("entry_groups").delete().eq("id", group.id);
      await refresh();
      toastWithUndo(group.collection_id ? `Ungrouped ${group.title} · collection kept` : `Ungrouped ${group.title}`, () =>
        restore({
          entryGroup: new Map(ids.map((id) => [id, group.id])),
          groups: [{ id: group.id, title: group.title, collection_id: group.collection_id }],
        }),
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

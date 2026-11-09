"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { invalidateData } from "@/lib/data/keys";
import { useUser } from "@/lib/user-context";
import type { Collection, CollectionInvite, CollectionMember, CollectionRole } from "@/lib/types";

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

export async function addEntriesToCollection(userId: string, entryIds: string[], collectionId: string) {
  if (!entryIds.length) return;
  const { error } = await createClient()
    .from("entry_collections")
    .upsert(
      entryIds.map((entry_id) => ({ entry_id, collection_id: collectionId, user_id: userId })),
      { onConflict: "entry_id,collection_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeEntriesFromCollection(entryIds: string[], collectionId: string) {
  if (!entryIds.length) return;
  const { error } = await createClient()
    .from("entry_collections")
    .delete()
    .eq("collection_id", collectionId)
    .in("entry_id", entryIds);
  if (error) throw error;
}

export function useCollections() {
  const user = useUser();
  return useQuery({
    queryKey: ["collections"],
    queryFn: async () => {
      const supabase = createClient();
      const { error: acceptError } = await supabase.rpc("accept_collection_invites");
      if (acceptError) throw acceptError;
      const [{ data, error }, { data: pending, error: pendingError }] = await Promise.all([
        supabase
        .from("collections")
        .select("*,entry_collections(count),collection_members(user_id,role)")
        .order("position")
        .order("created_at"),
        supabase.from("collection_invites").select("collection_id").is("accepted_at", null),
      ]);
      if (error) throw error;
      if (pendingError) throw pendingError;
      const pendingByCollection = new Map<string, number>();
      for (const invite of pending ?? []) {
        const id = invite.collection_id as string;
        pendingByCollection.set(id, (pendingByCollection.get(id) ?? 0) + 1);
      }
      return (data ?? []).map((c) => {
        const raw = c as Collection & {
          entry_collections: { count: number }[];
          collection_members: { user_id: string; role: "editor" | "viewer" }[];
        };
        const { entry_collections, collection_members, ...rest } = raw;
        const member = collection_members?.find((m) => m.user_id === user.id);
        return {
          ...rest,
          entry_count: entry_collections?.[0]?.count ?? 0,
          access_role: rest.user_id === user.id ? "owner" : member?.role,
          member_count: collection_members?.length ?? 0,
          pending_invite_count: pendingByCollection.get(rest.id) ?? 0,
        } as Collection;
      });
    },
  });
}

export function canEditCollection(collection: Collection | null | undefined) {
  return collection?.access_role === "owner" || collection?.access_role === "editor";
}

type RawMember = Omit<CollectionMember, "display_name"> & {
  profiles: { display_name: string | null } | null;
};

export function useCollectionSharing(collectionId: string | null, ownerId?: string) {
  return useQuery({
    queryKey: ["collection-sharing", collectionId],
    enabled: !!collectionId,
    queryFn: async () => {
      const supabase = createClient();
      const [membersResult, invitesResult, ownerResult] = await Promise.all([
        supabase
          .from("collection_members")
          .select("collection_id,user_id,role,invited_by,created_at,profiles!collection_members_user_id_fkey(display_name)")
          .eq("collection_id", collectionId!)
          .order("created_at"),
        supabase
          .from("collection_invites")
          .select("id,collection_id,email,role,invited_by,accepted_by,accepted_at,created_at")
          .eq("collection_id", collectionId!)
          .is("accepted_at", null)
          .order("created_at"),
        ownerId
          ? supabase.from("profiles").select("id,display_name").eq("id", ownerId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (membersResult.error) throw membersResult.error;
      if (invitesResult.error) throw invitesResult.error;
      if (ownerResult.error) throw ownerResult.error;
      return {
        owner: ownerResult.data as { id: string; display_name: string | null } | null,
        members: (membersResult.data ?? []).map((row) => {
          const raw = row as unknown as RawMember;
          return { ...raw, display_name: raw.profiles?.display_name ?? null, profiles: undefined } as CollectionMember;
        }),
        invites: (invitesResult.data ?? []) as CollectionInvite[],
      };
    },
  });
}

export function useCollectionSharingMutations(collectionId: string) {
  const qc = useQueryClient();
  const user = useUser();
  const supabase = createClient();
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["collection-sharing", collectionId] }),
      qc.invalidateQueries({ queryKey: ["collections"] }),
    ]);
  };

  const invite = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: Exclude<CollectionRole, "owner"> }) => {
      const { error } = await supabase.from("collection_invites").insert({
        collection_id: collectionId,
        email: email.trim().toLowerCase(),
        role,
        invited_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Exclude<CollectionRole, "owner"> }) => {
      const { error } = await supabase
        .from("collection_members")
        .update({ role })
        .eq("collection_id", collectionId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("collection_members")
        .delete()
        .eq("collection_id", collectionId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const cancelInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("collection_invites").delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { invite, changeRole, removeMember, cancelInvite };
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
    mutationFn: async (target: string | string[]) => {
      const ids = typeof target === "string" ? [target] : target;
      const { data, error } = await supabase.from("collections").delete().eq("user_id", userId).in("id", ids).select("id");
      if (error) throw error;
      return data.length;
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
        const ordered = orderedIds.flatMap((id, position) => {
          const c = byId.get(id);
          return c ? [{ ...c, position }] : [];
        });
        return [...ordered, ...list.filter((c) => c.user_id !== userId)];
      });
    },
    onSettled: done,
  });

  return { create, update, remove, reorder };
}

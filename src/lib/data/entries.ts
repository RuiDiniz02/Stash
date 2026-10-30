"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET, MAX_FILE_BYTES } from "@/lib/env";
import { attachmentKind, prepareFile, safeFileName } from "@/lib/files";
import { extractUrl, isBareUrl, uuid } from "@/lib/utils";
import { invalidateData } from "@/lib/data/keys";
import { deferWithUndo, toastWithUndo } from "@/lib/undo";
import { ensureTags } from "@/lib/data/tags";
import type { Attachment, Entry, EntryKind, EntryRow, LinkPreview, Reminder, RepeatInterval } from "@/lib/types";

export const ENTRY_COLUMNS =
  "id,user_id,kind,title,body,description,url,link_preview,is_pinned,is_favorite,is_archived,group_id,created_at,updated_at";
export const ENTRY_SELECT = `${ENTRY_COLUMNS},attachments(*),entry_collections(collection_id),entry_tags(tags(id,name)),reminders(*)`;

export const PAGE_SIZE = 30;

type RawEntry = EntryRow & {
  attachments?: Attachment[] | null;
  entry_collections?: { collection_id: string }[] | null;
  entry_tags?: { tags: { id: string; name: string } | null }[] | null;
  reminders?: Reminder[] | null;
};

export function normalizeEntry(raw: RawEntry): Entry {
  return {
    ...raw,
    attachments: [...(raw.attachments ?? [])].sort((a, b) => a.position - b.position),
    collection_ids: (raw.entry_collections ?? []).map((c) => c.collection_id),
    tags: (raw.entry_tags ?? [])
      .map((t) => t.tags)
      .filter((t): t is { id: string; name: string } => !!t)
      .sort((a, b) => a.name.localeCompare(b.name)),
    reminders: [...(raw.reminders ?? [])].sort((a, b) => a.due_at.localeCompare(b.due_at)),
  };
}

export type EntryView = "inbox" | "pinned" | "favorites" | "uncategorized" | "archived";

export interface EntryFilter {
  view?: EntryView;
  collectionId?: string;
  tag?: string;
}

async function fetchEntryPage(filter: EntryFilter, page: number) {
  const supabase = createClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Collection and tag views go through the search RPC, which handles membership joins.
  if (filter.collectionId || filter.tag) {
    const { data, error } = await supabase
      .rpc("search_entries", {
        collection: filter.collectionId ?? null,
        tag: filter.tag ?? null,
        include_archived: false,
      })
      .select(ENTRY_SELECT)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data as unknown as RawEntry[]).map(normalizeEntry);
  }

  let query = supabase.from("entries").select(ENTRY_SELECT);
  switch (filter.view ?? "inbox") {
    case "archived":
      query = query.eq("is_archived", true);
      break;
    case "pinned":
      query = query.eq("is_archived", false).eq("is_pinned", true);
      break;
    case "favorites":
      query = query.eq("is_archived", false).eq("is_favorite", true);
      break;
    case "uncategorized":
      query = query.eq("is_archived", false).is("entry_collections", null);
      break;
    default:
      query = query.eq("is_archived", false);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data as unknown as RawEntry[]).map(normalizeEntry);
}

export function entriesKey(filter: EntryFilter) {
  return ["entries", filter.view ?? "inbox", filter.collectionId ?? null, filter.tag ?? null] as const;
}

export function useEntries(filter: EntryFilter) {
  return useInfiniteQuery({
    queryKey: entriesKey(filter),
    queryFn: ({ pageParam }) => fetchEntryPage(filter, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length : undefined),
  });
}

export function usePinnedEntries() {
  return useQuery({
    queryKey: ["entries", "pinned-strip"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("entries")
        .select(ENTRY_SELECT)
        .eq("is_pinned", true)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as unknown as RawEntry[]).map(normalizeEntry);
    },
  });
}

export function useEntry(id: string | null) {
  return useQuery({
    queryKey: ["entry", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await createClient().from("entries").select(ENTRY_SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data ? normalizeEntry(data as unknown as RawEntry) : null;
    },
  });
}

export function deriveKind(url: string | null, attachmentKinds: string[]): EntryKind {
  if (attachmentKinds.length) {
    const unique = new Set(attachmentKinds);
    if (unique.size === 1) return attachmentKinds[0] as EntryKind;
    return "mixed";
  }
  if (url) return "link";
  return "note";
}

export interface CaptureInput {
  id?: string;
  text: string;
  title?: string;
  description?: string;
  files?: File[];
  tags?: string[];
  collectionIds?: string[];
  reminder?: { due_at: string; all_day: boolean; repeat: RepeatInterval; title?: string } | null;
  created_at?: string;
}

/** Splits free text into body + url. A bare URL becomes a link with no body. */
export function parseCaptureText(text: string) {
  const trimmed = text.trim();
  const url = extractUrl(trimmed);
  const body = trimmed && !isBareUrl(trimmed) ? trimmed : null;
  return { url, body };
}

async function uploadAttachments(userId: string, entryId: string, files: File[], startPosition = 0) {
  const supabase = createClient();
  const rows: Omit<Attachment, "id" | "created_at">[] = [];
  const failures: string[] = [];

  const prepared = await Promise.all(files.map(prepareFile));

  // Upload 3 at a time to stay friendly to mobile connections.
  for (let i = 0; i < prepared.length; i += 3) {
    const chunk = prepared.slice(i, i + 3);
    await Promise.all(
      chunk.map(async (p, j) => {
        if (p.file.size > MAX_FILE_BYTES) {
          failures.push(`${p.file.name} is larger than 50 MB`);
          return;
        }
        const path = `${userId}/${entryId}/${uuid().slice(0, 8)}-${safeFileName(p.file.name || "file")}`;
        const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, p.file, {
          contentType: p.file.type || "application/octet-stream",
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) {
          failures.push(`${p.file.name}: ${error.message}`);
          return;
        }
        rows.push({
          entry_id: entryId,
          user_id: userId,
          storage_path: path,
          kind: p.kind,
          mime_type: p.file.type || null,
          file_name: p.file.name || null,
          size_bytes: p.file.size,
          width: p.width ?? null,
          height: p.height ?? null,
          duration_seconds: p.duration ?? null,
          position: startPosition + i + j,
        });
      }),
    );
  }

  if (rows.length) {
    const { error } = await supabase.from("attachments").insert(rows);
    if (error) {
      await supabase.storage.from(STORAGE_BUCKET).remove(rows.map((r) => r.storage_path));
      throw error;
    }
  }
  return { rows, failures };
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as LinkPreview;
  } catch {
    return { failed: true, fetched_at: new Date().toISOString() };
  }
}

export async function refreshLinkPreview(entryId: string, url: string) {
  const preview = await fetchLinkPreview(url);
  const { error } = await createClient().from("entries").update({ link_preview: preview }).eq("id", entryId);
  if (error) throw error;
  return preview;
}

export async function createEntry(userId: string, input: CaptureInput) {
  const supabase = createClient();
  const entryId = input.id ?? uuid();
  const { url, body } = parseCaptureText(input.text);
  const files = input.files ?? [];
  const kinds = files.map((f) => attachmentKind(f.type, f.name));

  const { error } = await supabase.from("entries").insert({
    id: entryId,
    user_id: userId,
    kind: deriveKind(url, kinds),
    title: input.title?.trim() || null,
    body,
    description: input.description?.trim() || null,
    url,
    ...(input.created_at ? { created_at: input.created_at } : {}),
  });
  if (error) throw error;

  const tasks: Promise<unknown>[] = [];
  let failures: string[] = [];

  if (files.length) {
    tasks.push(uploadAttachments(userId, entryId, files).then((r) => (failures = r.failures)));
  }
  if (input.tags?.length) {
    tasks.push(setEntryTags(userId, entryId, input.tags));
  }
  if (input.collectionIds?.length) {
    tasks.push(
      Promise.resolve(
        supabase
          .from("entry_collections")
          .insert(input.collectionIds.map((cid) => ({ entry_id: entryId, collection_id: cid, user_id: userId }))),
      ).then(({ error }) => {
        if (error) throw error;
      }),
    );
  }
  if (input.reminder) {
    const title = input.reminder.title?.trim() || input.title?.trim() || summarize(body ?? url ?? "Reminder");
    tasks.push(
      Promise.resolve(
        supabase.from("reminders").insert({
          user_id: userId,
          entry_id: entryId,
          title,
          due_at: input.reminder.due_at,
          all_day: input.reminder.all_day,
          repeat: input.reminder.repeat,
        }),
      ).then(({ error }) => {
        if (error) throw error;
      }),
    );
  }
  await Promise.all(tasks);

  // Link previews are fetched after the save so capture never waits on a slow site.
  if (url) void refreshLinkPreview(entryId, url).catch(() => undefined);

  return { id: entryId, failures };
}

export function summarize(text: string, max = 80) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export async function setEntryTags(userId: string, entryId: string, names: string[]) {
  const supabase = createClient();
  const tags = await ensureTags(userId, names);
  const { error: delError } = await supabase.from("entry_tags").delete().eq("entry_id", entryId);
  if (delError) throw delError;
  if (tags.length) {
    const { error } = await supabase
      .from("entry_tags")
      .insert(tags.map((t) => ({ entry_id: entryId, tag_id: t.id, user_id: userId })));
    if (error) throw error;
  }
}

export async function setEntryCollections(userId: string, entryId: string, collectionIds: string[]) {
  const supabase = createClient();
  const { data: current, error } = await supabase.from("entry_collections").select("collection_id").eq("entry_id", entryId);
  if (error) throw error;
  const have = new Set((current ?? []).map((c) => c.collection_id as string));
  const want = new Set(collectionIds);
  const toAdd = collectionIds.filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));
  if (toRemove.length) {
    const { error: e } = await supabase.from("entry_collections").delete().eq("entry_id", entryId).in("collection_id", toRemove);
    if (e) throw e;
  }
  if (toAdd.length) {
    const { error: e } = await supabase
      .from("entry_collections")
      .insert(toAdd.map((cid) => ({ entry_id: entryId, collection_id: cid, user_id: userId })));
    if (e) throw e;
  }
}

export async function deleteEntries(ids: string[]) {
  const supabase = createClient();
  const { data: atts } = await supabase.from("attachments").select("storage_path").in("entry_id", ids);
  const paths = (atts ?? []).map((a) => a.storage_path as string);
  if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  const { error } = await supabase.from("entries").delete().in("id", ids);
  if (error) throw error;
}

export async function deleteAttachment(att: Pick<Attachment, "id" | "storage_path">) {
  const supabase = createClient();
  await supabase.storage.from(STORAGE_BUCKET).remove([att.storage_path]);
  const { error } = await supabase.from("attachments").delete().eq("id", att.id);
  if (error) throw error;
}

export async function addAttachments(userId: string, entry: Entry, files: File[]) {
  const start = entry.attachments.reduce((m, a) => Math.max(m, a.position + 1), 0);
  const result = await uploadAttachments(userId, entry.id, files, start);
  const kinds = [...entry.attachments.map((a) => a.kind), ...result.rows.map((r) => r.kind)];
  await createClient()
    .from("entries")
    .update({ kind: deriveKind(entry.url, kinds) })
    .eq("id", entry.id);
  return result;
}

export type EntryPatch = Partial<
  Pick<EntryRow, "title" | "body" | "description" | "url" | "is_pinned" | "is_favorite" | "is_archived" | "link_preview" | "kind">
>;

function patchCachedEntries(qc: ReturnType<typeof useQueryClient>, id: string, patch: EntryPatch) {
  qc.setQueriesData<InfiniteData<Entry[]>>({ queryKey: ["entries"] }, (data) => {
    if (!data || !("pages" in data)) return data;
    return { ...data, pages: data.pages.map((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e))) };
  });
  qc.setQueryData<Entry | null>(["entry", id], (e) => (e ? { ...e, ...patch } : e));
}

export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EntryPatch }) => {
      const { error } = await createClient().from("entries").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, patch }) => patchCachedEntries(qc, id, patch),
    onSettled: () => invalidateData(qc),
  });
}

/** Removes entries from every cached list (inbox pages, search results, pinned strip). */
export function hideEntriesInCache(qc: ReturnType<typeof useQueryClient>, ids: string[]) {
  const drop = new Set(ids);
  qc.setQueriesData<InfiniteData<Entry[]> | Entry[]>({ queryKey: ["entries"] }, (data) => {
    if (!data) return data;
    if (Array.isArray(data)) return data.filter((e) => !drop.has(e.id));
    return { ...data, pages: data.pages.map((p) => p.filter((e) => !drop.has(e.id))) };
  });
  qc.setQueriesData<Entry[]>({ queryKey: ["search"] }, (data) => data?.filter((e) => !drop.has(e.id)));
}

/**
 * Entry actions shared by menus, the detail panel and multi-select. Every destructive or
 * reversible action gives immediate feedback with Undo instead of a confirmation dialog.
 */
export function useEntryCommands() {
  const qc = useQueryClient();
  const refresh = () => invalidateData(qc);

  return {
    /** Hidden at once; files and rows are deleted when the undo window closes. */
    remove(ids: string[], onHidden?: () => void) {
      if (!ids.length) return;
      hideEntriesInCache(qc, ids);
      onHidden?.();
      deferWithUndo({
        message: ids.length === 1 ? "Entry deleted" : `${ids.length} entries deleted`,
        commit: () => deleteEntries(ids).finally(refresh),
        restore: () => void refresh(),
      });
    },

    async setArchived(ids: string[], archived: boolean) {
      if (!ids.length) return;
      hideEntriesInCache(qc, ids);
      const { error } = await createClient().from("entries").update({ is_archived: archived }).in("id", ids);
      await refresh();
      if (error) throw error;
      const what = ids.length === 1 ? "Entry" : `${ids.length} entries`;
      toastWithUndo(archived ? `${what} archived` : `${what} restored`, async () => {
        await createClient().from("entries").update({ is_archived: !archived }).in("id", ids);
        await refresh();
      });
    },

    /** Removes one attachment after the undo window; the file stays hidden meanwhile. */
    removeAttachment(entry: Entry, att: Attachment) {
      const hide = (e: Entry | null | undefined) =>
        e && e.id === entry.id ? { ...e, attachments: e.attachments.filter((a) => a.id !== att.id) } : e;
      qc.setQueryData<Entry | null>(["entry", entry.id], (e) => hide(e) ?? null);
      qc.setQueriesData<InfiniteData<Entry[]>>({ queryKey: ["entries"] }, (data) =>
        data && "pages" in data ? { ...data, pages: data.pages.map((p) => p.map((e) => hide(e)!)) } : data,
      );
      deferWithUndo({
        message: "File removed",
        commit: async () => {
          await deleteAttachment(att);
          const remaining = entry.attachments.filter((a) => a.id !== att.id).map((a) => a.kind);
          await createClient().from("entries").update({ kind: deriveKind(entry.url, remaining) }).eq("id", entry.id);
          await refresh();
        },
        restore: () => void refresh(),
      });
    },
  };
}

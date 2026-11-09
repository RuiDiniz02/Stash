"use client";

import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET } from "@/lib/env";

const EXPORT_LINK_SECONDS = 7 * 24 * 60 * 60;

async function fetchAll<T>(userId: string, table: string, select = "*"): Promise<T[]> {
  const supabase = createClient();
  const rows: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select(select).eq("user_id", userId).range(from, from + page - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

/** Builds a JSON export of everything the user owns, with 7-day download links for files. */
export async function exportData(userId: string, email: string | null) {
  const supabase = createClient();
  const [entries, collections, entryCollections, tags, entryTags, attachments, reminders] = await Promise.all([
    fetchAll(userId, "entries", "id,kind,title,body,description,url,link_preview,is_pinned,is_favorite,is_archived,created_at,updated_at"),
    fetchAll(userId, "collections"),
    fetchAll(userId, "entry_collections"),
    fetchAll(userId, "tags"),
    fetchAll(userId, "entry_tags"),
    fetchAll<{ storage_path: string } & Record<string, unknown>>(userId, "attachments"),
    fetchAll(userId, "reminders"),
  ]);

  const links = new Map<string, string>();
  for (let i = 0; i < attachments.length; i += 100) {
    const chunk = attachments.slice(i, i + 100).map((a) => a.storage_path);
    const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(chunk, EXPORT_LINK_SECONDS);
    data?.forEach((d) => d.path && d.signedUrl && links.set(d.path, d.signedUrl));
  }

  const payload = {
    format: "stash-export",
    version: 1,
    exported_at: new Date().toISOString(),
    account: { email },
    note: "File download links expire 7 days after export.",
    entries,
    collections,
    entry_collections: entryCollections,
    tags,
    entry_tags: entryTags,
    attachments: attachments.map((a) => ({ ...a, download_url: links.get(a.storage_path) ?? null })),
    reminders,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `stash-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return { entries: entries.length, files: attachments.length };
}

/** Deletes every stored file, then the account (all rows cascade). */
export async function deleteAccount(userId: string) {
  const supabase = createClient();
  const attachments = await fetchAll<{ storage_path: string }>(userId, "attachments", "storage_path");
  const paths = attachments.map((a) => a.storage_path);

  // Also sweep the user's folder for files that never got an attachment row.
  const { data: folders } = await supabase.storage.from(STORAGE_BUCKET).list(userId, { limit: 1000 });
  for (const folder of folders ?? []) {
    const { data: files } = await supabase.storage.from(STORAGE_BUCKET).list(`${userId}/${folder.name}`, { limit: 1000 });
    files?.forEach((f) => paths.push(`${userId}/${folder.name}/${f.name}`));
  }

  const unique = [...new Set(paths)];
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(unique.slice(i, i + 100));
    if (error) throw error;
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
  await supabase.auth.signOut();
}

"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/user-context";
import { instagramPost } from "@/lib/instagram";
import type { Attachment, LinkPreview } from "@/lib/types";

interface MediaAttachment extends Attachment {
  kind: "image" | "video";
  entry: { id: string; title: string | null; url: string | null };
}

interface MediaInstagram {
  kind: "instagram";
  id: string;
  created_at: string;
  post: NonNullable<ReturnType<typeof instagramPost>>;
  entry: { id: string; title: string | null; link_preview: LinkPreview | null };
}

type MediaItem = MediaAttachment | MediaInstagram;
type InstagramEntry = MediaInstagram["entry"] & { url: string; created_at: string };
export type MediaFilter = "all" | "image" | "video" | "instagram";
type MediaCursor = { attachments: number | null; instagram: number | null };
type MediaPage = { items: MediaItem[]; next: MediaCursor };

const MEDIA_PAGE = 48;
const INSTAGRAM_HOSTS = ["instagram.com", "www.instagram.com", "m.instagram.com"];
const INSTAGRAM_PATHS = ["p", "reel", "reels", "tv", "share", "*/p", "*/reel", "*/reels", "*/tv"];
const INSTAGRAM_FILTER = INSTAGRAM_HOSTS.flatMap((host) => INSTAGRAM_PATHS.map((path) => `url.ilike.https://${host}/${path}/*`)).join(",");

async function loadAttachments(userId: string, filter: MediaFilter, ascending: boolean, offset: number | null, signal: AbortSignal) {
  if (offset === null) return [];
  let query = createClient()
    .from("attachments")
    .select("*,entry:entries!inner(id,title,url)")
    .eq("user_id", userId)
    .eq("entry.is_archived", false);
  query = filter === "all" ? query.in("kind", ["image", "video"]) : query.eq("kind", filter);
  const { data, error } = await query.order("created_at", { ascending }).order("id", { ascending })
    .range(offset, offset + MEDIA_PAGE - 1).abortSignal(signal);
  if (error) throw error;
  return data as unknown as MediaAttachment[];
}

async function loadInstagram(userId: string, ascending: boolean, offset: number | null, signal: AbortSignal) {
  if (offset === null) return [];
  const { data, error } = await createClient().from("entries")
    .select("id,title,url,link_preview,created_at")
    .eq("user_id", userId).eq("is_archived", false).or(INSTAGRAM_FILTER)
    .order("created_at", { ascending }).order("id", { ascending })
    .range(offset, offset + MEDIA_PAGE - 1).abortSignal(signal);
  if (error) throw error;
  return data as InstagramEntry[];
}

function nextOffset(offset: number | null, fetched: number, consumed: number) {
  return offset === null || (fetched < MEDIA_PAGE && fetched === consumed) ? null : offset + consumed;
}

export function useMedia(kind: MediaFilter, order: "newest" | "oldest") {
  const { id: userId } = useUser();
  const initialPageParam: MediaCursor = { attachments: kind === "instagram" ? null : 0, instagram: kind === "image" ? null : 0 };
  return useInfiniteQuery({
    queryKey: ["media", userId, kind, order],
    initialPageParam,
    getNextPageParam: ({ next }: MediaPage) => next.attachments === null && next.instagram === null ? undefined : next,
    queryFn: async ({ pageParam, signal }) => {
      const ascending = order === "oldest";
      const [attachments, posts] = await Promise.all([
        loadAttachments(userId, kind, ascending, pageParam.attachments, signal),
        loadInstagram(userId, ascending, pageParam.instagram, signal),
      ]);
      // Merge the two sorted sources, advancing each independently. Unconsumed rows stay on the next page.
      const batch = [...attachments, ...posts]
        .sort((a, b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) * (ascending ? 1 : -1))
        .slice(0, MEDIA_PAGE);
      const items: MediaItem[] = [];
      let postCount = 0;
      for (const row of batch) {
        if ("entry" in row) {
          items.push(row);
        } else {
          postCount++;
          let post = instagramPost(row.url);
          if (post && !post.embedUrl && row.link_preview?.instagram_url) {
            const resolved = instagramPost(row.link_preview.instagram_url);
            if (resolved?.embedUrl) post = resolved;
          }
          if (post && (kind !== "video" || post.video)) {
            items.push({ kind: "instagram", id: row.id, created_at: row.created_at, entry: row, post });
          }
        }
      }
      return { items, next: {
        attachments: nextOffset(pageParam.attachments, attachments.length, batch.length - postCount),
        instagram: nextOffset(pageParam.instagram, posts.length, postCount),
      } };
    },
  });
}

export interface StorageUsage {
  totalBytes: number;
  count: number;
  byKind: Record<string, { bytes: number; count: number }>;
  largest: (Attachment & { entry_title: string | null })[];
}

export function useStorageUsage() {
  const { id: userId } = useUser();
  return useQuery({
    queryKey: ["storage"],
    queryFn: async (): Promise<StorageUsage> => {
      const { data, error } = await createClient()
        .from("attachments")
        .select("id,entry_id,storage_path,kind,file_name,size_bytes,mime_type,created_at,entries(title)")
        .eq("user_id", userId)
        .order("size_bytes", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as (Attachment & { entries: { title: string | null } | null })[];
      const byKind: StorageUsage["byKind"] = {};
      let totalBytes = 0;
      for (const r of rows) {
        const size = Number(r.size_bytes) || 0;
        totalBytes += size;
        byKind[r.kind] ??= { bytes: 0, count: 0 };
        byKind[r.kind].bytes += size;
        byKind[r.kind].count += 1;
      }
      return {
        totalBytes,
        count: rows.length,
        byKind,
        largest: rows.slice(0, 10).map((r) => ({ ...r, entry_title: r.entries?.title ?? null })),
      };
    },
  });
}

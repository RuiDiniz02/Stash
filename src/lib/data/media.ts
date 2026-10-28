"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/lib/types";

export interface MediaItem extends Attachment {
  entry: { id: string; title: string | null; url: string | null; body: string | null; is_archived: boolean };
}

const MEDIA_PAGE = 48;

export function useMedia(kind: "all" | "image" | "video", order: "newest" | "oldest") {
  return useInfiniteQuery({
    queryKey: ["media", kind, order],
    initialPageParam: 0,
    getNextPageParam: (last: MediaItem[], all) => (last.length === MEDIA_PAGE ? all.length : undefined),
    queryFn: async ({ pageParam }) => {
      const from = pageParam * MEDIA_PAGE;
      let q = createClient()
        .from("attachments")
        .select("*,entry:entries!inner(id,title,url,body,is_archived)")
        .eq("entry.is_archived", false);
      q = kind === "all" ? q.in("kind", ["image", "video"]) : q.eq("kind", kind);
      const { data, error } = await q
        .order("created_at", { ascending: order === "oldest" })
        .range(from, from + MEDIA_PAGE - 1);
      if (error) throw error;
      return data as unknown as MediaItem[];
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
  return useQuery({
    queryKey: ["storage"],
    queryFn: async (): Promise<StorageUsage> => {
      const { data, error } = await createClient()
        .from("attachments")
        .select("id,entry_id,storage_path,kind,file_name,size_bytes,mime_type,created_at,entries(title)")
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

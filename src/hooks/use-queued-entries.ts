"use client";

import { useMemo } from "react";
import { useQueuedCount } from "@/components/shell/sync";
import { deriveKind, parseCaptureText, type EntryFilter } from "@/lib/data/entries";
import { getQueued } from "@/lib/outbox";
import { useUser } from "@/lib/user-context";
import type { Entry } from "@/lib/types";

/** Pending captures belong in their destination as well as the Inbox. */
export function useQueuedEntries(filter: EntryFilter): Entry[] {
  const user = useUser();
  const count = useQueuedCount(user.id);
  return useMemo(() => {
    if (!count || (filter.view && filter.view !== "inbox") || filter.tag) return [];
    return getQueued(user.id)
      .filter((q) => (!filter.collectionId || q.collectionIds?.includes(filter.collectionId)) && (!filter.groupId || q.groupId === filter.groupId))
      .map((q) => {
        const { url, body } = parseCaptureText(q.text);
        return {
          id: q.id, user_id: user.id, kind: deriveKind(url, []), title: q.title || null,
          body, description: q.description || null, url, link_preview: null,
          is_pinned: false, is_favorite: false, is_archived: false, group_id: q.groupId ?? null,
          created_at: q.created_at, updated_at: q.created_at, attachments: [],
          collection_ids: q.collectionIds ?? [], tags: (q.tags ?? []).map((name) => ({ id: name, name })),
          reminders: [], pending: true,
        } satisfies Entry;
      });
  }, [count, user.id, filter.view, filter.tag, filter.collectionId, filter.groupId]);
}

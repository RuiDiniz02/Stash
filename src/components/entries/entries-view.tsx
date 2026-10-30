"use client";

import { useMemo } from "react";
import { Archive, FolderOpen, Hash, Inbox, LayoutGrid, List, Pin, Star, Tag } from "lucide-react";
import { useEntries, usePinnedEntries, parseCaptureText, deriveKind, type EntryFilter } from "@/lib/data/entries";
import { getQueued } from "@/lib/outbox";
import { useUser } from "@/lib/user-context";
import { useQueuedCount } from "@/components/shell/sync";
import { useLocalState } from "@/hooks/use-local-state";
import { EmptyState, ErrorState, Segmented } from "@/components/ui/misc";
import { EntryFeed, FeedSkeleton } from "./entry-feed";
import { EntryCard } from "./entry-card";
import { SelectionBar } from "./selection-bar";
import { useGroups } from "@/lib/data/groups";
import { InboxDnd } from "./dnd";
import type { Entry } from "@/lib/types";

export function LayoutToggle({ value, onChange }: { value: "list" | "grid"; onChange: (v: "list" | "grid") => void }) {
  return (
    <Segmented
      size="sm"
      value={value}
      onChange={onChange}
      options={[
        { value: "list", label: "", icon: List, ariaLabel: "List view" },
        { value: "grid", label: "", icon: LayoutGrid, ariaLabel: "Grid view" },
      ]}
    />
  );
}

export function useLayoutPref(key: string) {
  return useLocalState<"list" | "grid">(`stash-layout-${key}`, "list");
}

function useQueuedEntries(enabled: boolean): Entry[] {
  const user = useUser();
  const count = useQueuedCount(user.id);
  return useMemo(() => {
    if (!enabled || !count) return [];
    return getQueued(user.id).map((q) => {
      const { url, body } = parseCaptureText(q.text);
      return {
        id: q.id,
        user_id: user.id,
        kind: deriveKind(url, []),
        title: q.title || null,
        body,
        description: q.description || null,
        url,
        link_preview: null,
        is_pinned: false,
        is_favorite: false,
        is_archived: false,
        group_id: null,
        created_at: q.created_at,
        updated_at: q.created_at,
        attachments: [],
        collection_ids: q.collectionIds ?? [],
        tags: (q.tags ?? []).map((name) => ({ id: name, name })),
        reminders: [],
        pending: true,
      } satisfies Entry;
    });
  }, [enabled, count, user.id]);
}

const EMPTY: Record<string, { icon: typeof Inbox; title: string; description: string }> = {
  inbox: {
    icon: Inbox,
    title: "Your stash is empty",
    description: "Type a thought, paste a link or drop a photo above. Organize later — or never.",
  },
  pinned: { icon: Pin, title: "Nothing pinned", description: "Pin entries you want to keep at the top." },
  favorites: { icon: Star, title: "No favorites yet", description: "Star the things you love to find them here." },
  uncategorized: { icon: Tag, title: "All organized", description: "Every entry belongs to a collection." },
  archived: { icon: Archive, title: "Archive is empty", description: "Archived entries are hidden from your inbox but stay searchable." },
};

export function EntriesView({
  filter,
  layout,
  showPinnedStrip,
  emptyAction,
}: {
  filter: EntryFilter;
  layout: "list" | "grid";
  showPinnedStrip?: boolean;
  emptyAction?: React.ReactNode;
}) {
  const query = useEntries(filter);
  const pinned = usePinnedEntries();
  const isInbox = (filter.view ?? "inbox") === "inbox" && !filter.collectionId && !filter.tag;
  const queued = useQueuedEntries(isInbox);
  const { data: groups } = useGroups();

  const entries = useMemo(() => {
    const loaded = query.data?.pages.flat() ?? [];
    const ids = new Set(loaded.map((e) => e.id));
    return [...queued.filter((q) => !ids.has(q.id)), ...loaded];
  }, [query.data, queued]);

  const pinnedEntries = showPinnedStrip ? (pinned.data ?? []) : [];

  if (query.isLoading) return <FeedSkeleton layout={layout} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const empty = filter.collectionId
    ? { icon: FolderOpen, title: "Nothing here yet", description: "Capture straight into this collection above, or add entries from their ⋯ menu." }
    : filter.tag
      ? { icon: Hash, title: "No entries with this tag", description: "Tags you add to entries show up here." }
      : (EMPTY[filter.view ?? "inbox"] ?? EMPTY.inbox);

  const content = (
    <>
      {pinnedEntries.length > 0 && (
        <section aria-label="Pinned" className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
            <Pin className="size-3" /> Pinned
          </h2>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none md:-mx-8 md:px-8">
            {pinnedEntries.map((e) => (
              <div key={e.id} className="w-64 shrink-0 snap-start sm:w-72">
                <EntryCard entry={e} layout="grid" noDrag />
              </div>
            ))}
          </div>
        </section>
      )}
      {entries.length === 0 ? (
        <EmptyState {...empty} action={emptyAction} />
      ) : (
        <EntryFeed
          entries={entries}
          layout={layout}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          fetchNextPage={() => void query.fetchNextPage()}
          groups={isInbox ? (groups ?? []) : undefined}
        />
      )}
    </>
  );

  return (
    <>
      {/* Drag one entry onto another to group them (Inbox "All" view, where groups are shown). */}
      {isInbox ? (
        <InboxDnd entries={entries} groups={groups ?? []}>
          {content}
        </InboxDnd>
      ) : (
        content
      )}
      <SelectionBar entries={entries} />
    </>
  );
}

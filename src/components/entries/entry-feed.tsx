"use client";

import { useEffect, useMemo, useRef } from "react";
import { format, isThisYear, isToday, isYesterday, differenceInCalendarDays } from "date-fns";
import type { Entry, EntryGroup } from "@/lib/types";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { EntryCard } from "./entry-card";
import { GroupCard } from "./group-card";

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, "EEEE");
  return format(d, isThisYear(d) ? "EEEE, d MMMM" : "d MMMM yyyy");
}

type FeedItem =
  | { type: "entry"; key: string; at: string; entry: Entry }
  | { type: "group"; key: string; at: string; group: EntryGroup; entries: Entry[] };

/** Folds grouped entries into one item placed where the group's newest loaded entry is. */
function toItems(entries: Entry[], groups?: EntryGroup[]): FeedItem[] {
  if (!groups) return entries.map((e) => ({ type: "entry", key: e.id, at: e.created_at, entry: e }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const items: FeedItem[] = [];
  const placed = new Map<string, Extract<FeedItem, { type: "group" }>>();
  for (const e of entries) {
    const group = e.group_id ? byId.get(e.group_id) : undefined;
    if (!group) {
      items.push({ type: "entry", key: e.id, at: e.created_at, entry: e });
      continue;
    }
    const existing = placed.get(group.id);
    if (existing) existing.entries.push(e);
    else {
      const item = { type: "group" as const, key: `g-${group.id}`, at: e.created_at, group, entries: [e] };
      placed.set(group.id, item);
      items.push(item);
    }
  }
  return items;
}

function groupByDay(items: FeedItem[]) {
  const days: { key: string; label: string; items: FeedItem[] }[] = [];
  for (const item of items) {
    const d = new Date(item.at);
    const key = format(d, "yyyy-MM-dd");
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(d), items: [item] });
  }
  return days;
}

export function EntryFeed({
  entries,
  layout,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  grouped = true,
  groups,
  collectionId,
}: {
  entries: Entry[];
  layout: "list" | "grid";
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  /** Group headers by day. */
  grouped?: boolean;
  /** When given, entries in a group are shown together in one group card. */
  groups?: EntryGroup[];
  collectionId?: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const items = toItems(entries, groups);
    return grouped ? groupByDay(items) : [{ key: "all", label: "", items }];
  }, [entries, groups, grouped]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || !fetchNextPage) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const render = (item: FeedItem) =>
    item.type === "group" ? (
      <GroupCard key={item.key} group={item.group} entries={item.entries} layout={layout} contextCollectionId={collectionId} />
    ) : (
      <EntryCard key={item.key} entry={item.entry} layout={layout} contextCollectionId={collectionId} />
    );

  return (
    <div>
      {days.map((d) => (
        <section key={d.key} aria-label={d.label || undefined} className="mb-6">
          {d.label && (
            <h2 className="sticky top-14 z-10 -mx-1 mb-2 inline-block rounded-md bg-background/80 px-1 py-1 text-xs font-semibold tracking-wide text-muted-foreground backdrop-blur">
              {d.label}
            </h2>
          )}
          {layout === "grid" ? <div className="masonry">{d.items.map(render)}</div> : <div className="flex flex-col gap-3">{d.items.map(render)}</div>}
        </section>
      ))}
      <div ref={sentinel} aria-hidden className="h-px" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
    </div>
  );
}

export function FeedSkeleton({ layout = "list" }: { layout?: "list" | "grid" }) {
  return (
    <div className={layout === "grid" ? "masonry" : "flex flex-col gap-3"} aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mb-3 break-inside-avoid rounded-2xl border bg-card p-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-4 w-full" />
          {i % 2 === 0 && <Skeleton className="mt-3 aspect-[4/3] w-full rounded-xl" />}
          <Skeleton className="mt-3 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

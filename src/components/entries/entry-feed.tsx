"use client";

import { useEffect, useMemo, useRef } from "react";
import { format, isThisYear, isToday, isYesterday, differenceInCalendarDays } from "date-fns";
import type { Entry } from "@/lib/types";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { EntryCard } from "./entry-card";

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, "EEEE");
  return format(d, isThisYear(d) ? "EEEE, d MMMM" : "d MMMM yyyy");
}

export function groupByDay(entries: Entry[]) {
  const groups: { key: string; label: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const d = new Date(e.created_at);
    const key = format(d, "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(e);
    else groups.push({ key, label: dayLabel(d), items: [e] });
  }
  return groups;
}

export function EntryFeed({
  entries,
  layout,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  grouped = true,
}: {
  entries: Entry[];
  layout: "list" | "grid";
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  grouped?: boolean;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => (grouped ? groupByDay(entries) : [{ key: "all", label: "", items: entries }]), [entries, grouped]);

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

  return (
    <div>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || undefined} className="mb-6">
          {g.label && (
            <h2 className="sticky top-14 z-10 -mx-1 mb-2 inline-block rounded-md bg-background/80 px-1 py-1 text-xs font-semibold tracking-wide text-muted-foreground backdrop-blur">
              {g.label}
            </h2>
          )}
          {layout === "grid" ? (
            <div className="masonry">
              {g.items.map((e) => (
                <EntryCard key={e.id} entry={e} layout="grid" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {g.items.map((e) => (
                <EntryCard key={e.id} entry={e} layout="list" />
              ))}
            </div>
          )}
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Images } from "lucide-react";
import { PageHeader } from "@/components/shell/nav";
import { EmptyState, ErrorState, Segmented, Skeleton, Spinner } from "@/components/ui/misc";
import { AttachmentImage, AttachmentVideoThumb } from "@/components/entries/media";
import { Lightbox } from "@/components/media/lightbox";
import { useStash } from "@/components/shell/stash-context";
import { useMedia } from "@/lib/data/media";
import { useLocalState } from "@/hooks/use-local-state";

export default function MediaPage() {
  const [kind, setKind] = useLocalState<"all" | "image" | "video">("stash-media-kind", "all");
  const [order, setOrder] = useLocalState<"newest" | "oldest">("stash-media-order", "newest");
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useMedia(kind, order);
  const { openEntry } = useStash();
  const [index, setIndex] = useState<number | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const items = useMemo(() => data?.pages.flat() ?? [], [data]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && !isFetchingNextPage && void fetchNextPage(), { rootMargin: "1000px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <PageHeader
        title="Media"
        subtitle={items.length ? `${items.length}${hasNextPage ? "+" : ""} items` : undefined}
        actions={
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as "newest" | "oldest")}
            aria-label="Sort"
            className="h-8 rounded-lg border bg-card px-2 text-[13px] text-muted-foreground outline-none"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        }
      >
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "image", label: "Photos" },
            { value: "video", label: "Videos" },
          ]}
        />
      </PageHeader>
      <div className="mx-auto max-w-5xl px-4 pt-4 md:px-8">
        {isLoading && (
          <div className="masonry">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="mb-3 w-full rounded-xl" style={{ aspectRatio: [1, 0.75, 1.33][i % 3] }} />
            ))}
          </div>
        )}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}
        {!isLoading && !error && items.length === 0 && (
          <EmptyState icon={Images} title="No photos or videos yet" description="Images and videos you capture appear here as a visual library." />
        )}
        <div className="masonry">
          {items.map((item, i) => {
            const ratio = item.width && item.height ? item.width / item.height : item.kind === "video" ? 16 / 9 : 1;
            return (
              <button
                key={item.id}
                onClick={() => setIndex(i)}
                className="group relative mb-3 block w-full overflow-hidden rounded-xl break-inside-avoid focus-visible:ring-3 focus-visible:ring-ring/50"
                style={{ aspectRatio: Math.min(Math.max(ratio, 0.5), 2) }}
                aria-label={item.entry.title ?? item.file_name ?? "Open media"}
              >
                {item.kind === "video" ? <AttachmentVideoThumb att={item} className="size-full" /> : <AttachmentImage att={item} className="size-full" />}
                {item.entry.title && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2.5 pt-8 text-left text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                    {item.entry.title}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div ref={sentinel} className="h-px" />
        {isFetchingNextPage && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
      </div>
      <Lightbox
        items={items.map((m) => ({ ...m, sourceUrl: m.entry.url, caption: m.entry.title }))}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
        onOpenEntry={(id) => {
          setIndex(null);
          openEntry(id);
        }}
      />
    </>
  );
}

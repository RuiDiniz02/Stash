"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Images, Play } from "lucide-react";
import { PageHeader } from "@/components/shell/nav";
import { EmptyState, ErrorState, Segmented, Skeleton, Spinner } from "@/components/ui/misc";
import { AttachmentImage, AttachmentVideoThumb } from "@/components/entries/media";
import { Lightbox, type LightboxItem } from "@/components/media/lightbox";
import { useStash } from "@/components/shell/stash-context";
import { useMedia, type MediaFilter } from "@/lib/data/media";
import { useLocalState } from "@/hooks/use-local-state";
import { instagramThumbnail } from "@/lib/instagram";

export default function MediaPage() {
  const [kind, setKind] = useLocalState<MediaFilter>("stash-media-kind", "all");
  const [order, setOrder] = useLocalState<"newest" | "oldest">("stash-media-order", "newest");
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useMedia(kind, order);
  const { openEntry } = useStash();
  const [selected, setSelected] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const lightboxItems = useMemo(() => items.map((item): LightboxItem => item.kind === "instagram" ? {
    kind: "instagram", id: item.id, entry_id: item.entry.id, caption: item.entry.title ?? item.entry.link_preview?.title,
    sourceUrl: item.post.sourceUrl, embedUrl: item.post.embedUrl,
  } : { ...item, sourceUrl: item.entry.url, caption: item.entry.title }), [items]);
  const index = selected === null ? -1 : lightboxItems.findIndex((item) => `${item.kind}:${item.id}` === selected);

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
            { value: "instagram", label: "Instagram" },
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
        {!isLoading && !error && items.length === 0 && !hasNextPage && (
          <EmptyState icon={Images} title="Nothing here yet" description="Save photos, videos or Instagram links in the Inbox to see them here." />
        )}
        <div className="masonry">
          {items.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const ratio = item.kind === "instagram" ? (item.post.video ? 0.68 : 1)
              : item.width && item.height ? item.width / item.height : item.kind === "video" ? 16 / 9 : 1;
            const title = item.kind === "instagram" ? item.entry.title ?? item.entry.link_preview?.title : item.entry.title;
            const cover = item.kind === "instagram" ? instagramThumbnail(item.entry.link_preview?.image) : null;
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className="group relative mb-3 block w-full overflow-hidden rounded-2xl bg-muted break-inside-avoid focus-visible:ring-3 focus-visible:ring-ring/50"
                style={{ aspectRatio: Math.min(Math.max(ratio, 0.5), 2) }}
                aria-label={title ?? (item.kind === "instagram" ? item.post.video ? "Open Instagram video" : "Open Instagram post" : item.file_name ?? "Open media")}
              >
                {item.kind === "instagram" ? (
                  <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-purple-800 via-fuchsia-800 to-orange-700 text-white">
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} className="absolute inset-0 size-full object-cover" />
                    )}
                    <span className="relative grid size-10 place-items-center rounded-full bg-black/45 backdrop-blur-sm">
                      {item.post.video ? <Play className="size-4" fill="currentColor" aria-hidden /> : <Camera className="size-[18px]" aria-hidden />}
                    </span>
                  </span>
                ) : item.kind === "video" ? <AttachmentVideoThumb att={item} className="size-full" /> : <AttachmentImage att={item} className="size-full" />}
                {(title || item.kind === "instagram") && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 pt-8 text-left text-xs font-medium text-white">
                    {item.kind === "instagram" && <span className="mb-0.5 flex items-center gap-1 text-[11px] text-white/90"><Camera className="size-3" aria-hidden /> {item.post.video ? "Instagram video" : "Instagram"}</span>}
                    {title && <span className="line-clamp-2">{title}</span>}
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
        items={lightboxItems}
        index={index < 0 ? null : index}
        onIndexChange={(next) => { const item = lightboxItems[next]; setSelected(`${item.kind}:${item.id}`); }}
        onClose={() => setSelected(null)}
        onOpenEntry={(id) => {
          setSelected(null);
          openEntry(id);
        }}
      />
    </>
  );
}

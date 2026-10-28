"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Play } from "lucide-react";
import { toast } from "sonner";
import { downloadStorageFile, useSignedUrl } from "@/lib/data/signed-urls";
import type { Attachment } from "@/lib/types";
import { cn, errorMessage, formatBytes, formatDuration } from "@/lib/utils";
import { Skeleton } from "@/components/ui/misc";

/**
 * True once the element comes within `margin` of the viewport. Used instead of native
 * loading="lazy", which Chromium never triggers inside CSS multi-column (masonry) layouts.
 */
function useNearViewport<T extends Element>(margin = "600px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
}

export function AttachmentImage({
  att,
  className,
  sizes,
  onClick,
}: {
  att: Pick<Attachment, "storage_path" | "file_name" | "width" | "height">;
  className?: string;
  sizes?: string;
  onClick?: () => void;
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  // Signed URLs are only requested for images about to be shown.
  const url = useSignedUrl(near ? att.storage_path : null);
  const [loaded, setLoaded] = useState(false);
  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-muted", className)} onClick={onClick}>
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      {url && (
        // Signed URLs are short-lived and private, so next/image's optimiser cannot cache them usefully.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={att.file_name ?? ""}
          sizes={sizes}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn("size-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

export function AttachmentVideoThumb({ att, className, onClick }: { att: Attachment; className?: string; onClick?: () => void }) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const url = useSignedUrl(near ? att.storage_path : null);
  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-black", className)} onClick={onClick}>
      {url && (
        <video
          src={`${url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
          aria-label={att.file_name ?? "Video"}
        />
      )}
      <div className="absolute inset-0 grid place-items-center bg-black/10">
        <span className="grid size-11 place-items-center rounded-full bg-black/50 backdrop-blur-sm">
          <Play className="ml-0.5 size-5 fill-white text-white" />
        </span>
      </div>
      {att.duration_seconds ? (
        <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {formatDuration(Number(att.duration_seconds))}
        </span>
      ) : null}
    </div>
  );
}

export function AttachmentVideoPlayer({ att, className }: { att: Attachment; className?: string }) {
  const url = useSignedUrl(att.storage_path);
  if (!url) return <Skeleton className={cn("aspect-video", className)} />;
  return <video src={url} controls playsInline preload="metadata" className={cn("w-full bg-black", className)} />;
}

export function AttachmentAudio({ att, compact }: { att: Attachment; compact?: boolean }) {
  const url = useSignedUrl(att.storage_path);
  return (
    <div className={cn("rounded-xl border bg-muted/40", compact ? "p-2" : "p-3")} onClick={(e) => e.stopPropagation()}>
      {!compact && <p className="mb-2 truncate text-xs text-muted-foreground">{att.file_name}</p>}
      {url ? <audio src={url} controls preload="metadata" className="h-9 w-full" /> : <Skeleton className="h-9" />}
    </div>
  );
}

export function AttachmentFile({ att }: { att: Attachment }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          await downloadStorageFile(att.storage_path, att.file_name ?? "file");
        } catch (err) {
          toast.error(errorMessage(err, "Download failed"));
        } finally {
          setBusy(false);
        }
      }}
      className="flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 text-left transition-colors hover:bg-accent"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        <FileText className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{att.file_name ?? "File"}</span>
        <span className="block text-xs text-muted-foreground">
          {formatBytes(att.size_bytes)}
          {att.mime_type ? ` · ${att.mime_type.split("/").pop()}` : ""}
        </span>
      </span>
      <Download className={cn("size-4 text-muted-foreground", busy && "animate-bounce")} />
    </button>
  );
}

/** Visual grid (1–4 tiles) for an entry's images and videos. */
export function MediaGrid({ items, onOpen, className }: { items: Attachment[]; onOpen?: (index: number) => void; className?: string }) {
  if (!items.length) return null;
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  const single = shown.length === 1;
  const ratio = single && shown[0].width && shown[0].height ? shown[0].width / shown[0].height : 4 / 3;

  return (
    <div
      className={cn("grid gap-1 overflow-hidden rounded-xl", shown.length > 1 && "grid-cols-2", className)}
      style={single ? { aspectRatio: Math.min(Math.max(ratio, 0.75), 1.9) } : undefined}
    >
      {shown.map((att, i) => {
        const tile = cn(
          "cursor-zoom-in",
          !single && "aspect-square",
          single && "size-full",
          shown.length === 3 && i === 0 && "row-span-2 aspect-auto",
        );
        const open = onOpen
          ? (e?: React.MouseEvent) => {
              e?.stopPropagation();
              onOpen(i);
            }
          : undefined;
        return (
          <div key={att.id} className="relative">
            {att.kind === "video" ? (
              <AttachmentVideoThumb att={att} className={tile} onClick={open} />
            ) : (
              <AttachmentImage att={att} className={tile} onClick={open} />
            )}
            {extra > 0 && i === shown.length - 1 && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45 text-lg font-semibold text-white">
                +{extra}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

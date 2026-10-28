"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, ExternalLink, PanelRight, X } from "lucide-react";
import { toast } from "sonner";
import { downloadStorageFile, useSignedUrl } from "@/lib/data/signed-urls";
import type { Attachment } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { Spinner } from "@/components/ui/misc";

export interface LightboxItem extends Attachment {
  sourceUrl?: string | null;
  caption?: string | null;
}

function Slide({ item }: { item: LightboxItem }) {
  const url = useSignedUrl(item.storage_path);
  if (!url) return <Spinner className="size-6 text-white/70" />;
  if (item.kind === "video") {
    return <video key={url} src={url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={item.file_name ?? ""} className="max-h-full max-w-full rounded-lg object-contain select-none" draggable={false} />;
}

export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
  onOpenEntry,
}: {
  items: LightboxItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onOpenEntry?: (entryId: string) => void;
}) {
  const open = index !== null && !!items[index];
  const item = open ? items[index!] : null;
  const touchX = useRef<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next >= 0 && next < items.length) onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/95 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] flex flex-col text-white outline-none"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
        >
          <DialogPrimitive.Title className="sr-only">{item?.file_name ?? "Media"}</DialogPrimitive.Title>
          <div className="flex items-center gap-1 px-3 pt-safe">
            <div className="flex h-14 min-w-0 flex-1 items-center gap-2 text-sm text-white/80">
              <span className="tabular-nums">
                {(index ?? 0) + 1} / {items.length}
              </span>
              {item?.caption && <span className="truncate text-white/60">· {item.caption}</span>}
            </div>
            {item?.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="Open source link">
                <ExternalLink className="size-5" />
              </a>
            )}
            {item && onOpenEntry && (
              <button onClick={() => onOpenEntry(item.entry_id)} className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="Open entry">
                <PanelRight className="size-5" />
              </button>
            )}
            {item && (
              <button
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await downloadStorageFile(item.storage_path, item.file_name ?? "file");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setDownloading(false);
                  }
                }}
                className="grid size-10 place-items-center rounded-full hover:bg-white/10"
                aria-label="Download"
              >
                {downloading ? <Spinner className="size-5 text-white" /> : <Download className="size-5" />}
              </button>
            )}
            <DialogPrimitive.Close className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="Close">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 pb-safe sm:p-8" onClick={(e) => e.target === e.currentTarget && onClose()}>
            {item && <Slide key={item.id} item={item} />}
            {index !== null && index > 0 && (
              <NavButton side="left" onClick={() => go(-1)} />
            )}
            {index !== null && index < items.length - 1 && <NavButton side="right" onClick={() => go(1)} />}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={cn(
        "absolute top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20 sm:grid",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      <Icon className="size-6" />
    </button>
  );
}

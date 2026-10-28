"use client";

import { useEffect, useState } from "react";
import { FileText, Mic, Play, X } from "lucide-react";
import { attachmentKind } from "@/lib/files";
import { formatBytes } from "@/lib/utils";

/** Preview for a local (not yet uploaded) file. */
export function FileThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const kind = attachmentKind(file.type, file.name);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "image" && kind !== "video") return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file, kind]);

  return (
    <div className="group relative size-20 shrink-0 overflow-hidden rounded-xl border bg-muted animate-pop">
      {kind === "image" && src && <img src={src} alt={file.name} className="size-full object-cover" />}
      {kind === "video" && src && (
        <>
          <video src={src} muted playsInline preload="metadata" className="size-full object-cover" />
          <Play className="absolute inset-0 m-auto size-6 fill-white text-white drop-shadow" />
        </>
      )}
      {(kind === "audio" || kind === "file") && (
        <div className="flex size-full flex-col items-center justify-center gap-1 p-1.5 text-center">
          {kind === "audio" ? <Mic className="size-5 text-primary" /> : <FileText className="size-5 text-muted-foreground" />}
          <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">{file.name}</span>
          <span className="text-[10px] text-muted-foreground/70">{formatBytes(file.size)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

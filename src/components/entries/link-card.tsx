"use client";

import { useState } from "react";
import { ExternalLink, Globe, Play } from "lucide-react";
import type { LinkPreview, Provider } from "@/lib/types";
import { cn, hostname } from "@/lib/utils";

const PROVIDER_LABEL: Record<Provider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
  pinterest: "Pinterest",
  threads: "Threads",
  reddit: "Reddit",
  spotify: "Spotify",
  web: "Web",
};

const PROVIDER_TINT: Partial<Record<Provider, string>> = {
  youtube: "oklch(0.6 0.22 27)",
  tiktok: "oklch(0.25 0 0)",
  instagram: "oklch(0.6 0.22 350)",
  x: "oklch(0.2 0 0)",
  vimeo: "oklch(0.65 0.13 225)",
  pinterest: "oklch(0.55 0.22 25)",
  spotify: "oklch(0.7 0.18 150)",
  reddit: "oklch(0.65 0.2 40)",
  facebook: "oklch(0.55 0.18 255)",
  threads: "oklch(0.2 0 0)",
};

export function detectProvider(url: string | null | undefined): Provider {
  const h = hostname(url);
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(h)) return "youtube";
  if (/(^|\.)vimeo\.com$/.test(h)) return "vimeo";
  if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)(x|twitter)\.com$/.test(h)) return "x";
  if (/(^|\.)(facebook|fb)\.com$|^fb\.watch$/.test(h)) return "facebook";
  if (/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/.test(h)) return "pinterest";
  if (/(^|\.)threads\.(net|com)$/.test(h)) return "threads";
  if (/(^|\.)reddit\.com$|^redd\.it$/.test(h)) return "reddit";
  if (/(^|\.)spotify\.com$/.test(h)) return "spotify";
  return "web";
}

export function ProviderBadge({ provider, className }: { provider: Provider; className?: string }) {
  if (provider === "web") return null;
  return (
    <span
      className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase", className)}
      style={{ background: PROVIDER_TINT[provider] ?? "var(--muted-foreground)" }}
    >
      {PROVIDER_LABEL[provider]}
    </span>
  );
}

export function LinkCard({
  url,
  preview,
  compact,
  className,
}: {
  url: string;
  preview: LinkPreview | null;
  compact?: boolean;
  className?: string;
}) {
  const provider = preview?.provider ?? detectProvider(url);
  const [imgOk, setImgOk] = useState(true);
  const image = preview?.image && imgOk ? preview.image : null;
  const title = preview?.title || (provider !== "web" ? `${PROVIDER_LABEL[provider]} post` : hostname(url));
  const isVideo = ["youtube", "vimeo", "tiktok"].includes(provider) || /\/reel|\/reels\//.test(url);
  const loading = !preview;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/link flex overflow-hidden rounded-xl border bg-card transition-colors hover:bg-accent/50",
        compact || !image ? "flex-row items-stretch" : "flex-col",
        className,
      )}
    >
      {image && (
        <div className={cn("relative shrink-0 overflow-hidden bg-muted", compact ? "w-24" : "aspect-[1.91/1] w-full")}>
          {/* External preview images are loaded directly from the source site. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="size-full object-cover transition-transform duration-500 group-hover/link:scale-[1.02]"
          />
          {isVideo && !compact && (
            <span className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full bg-black/50 backdrop-blur-sm">
              <Play className="ml-0.5 size-5 fill-white text-white" />
            </span>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {preview?.favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.favicon} alt="" className="size-3.5 rounded-sm" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />
          ) : (
            <Globe className="size-3.5" />
          )}
          <span className="truncate">{preview?.site_name || hostname(url)}</span>
          <ProviderBadge provider={provider} className="ml-auto" />
        </div>
        <p className={cn("line-clamp-2 text-sm font-medium leading-snug", loading && "text-muted-foreground")}>
          {loading ? hostname(url) : title}
        </p>
        {!compact && preview?.description && <p className="line-clamp-2 text-xs text-muted-foreground">{preview.description}</p>}
        {preview?.failed && provider !== "web" && (
          <p className="text-[11px] text-muted-foreground">Preview not available for this {PROVIDER_LABEL[provider]} link. Tap to open.</p>
        )}
      </div>
      {!image && (
        <span className="grid w-10 shrink-0 place-items-center text-muted-foreground">
          <ExternalLink className="size-4" />
        </span>
      )}
    </a>
  );
}

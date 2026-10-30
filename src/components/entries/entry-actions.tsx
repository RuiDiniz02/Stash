"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Copy,
  Ellipsis,
  ExternalLink,
  FolderPlus,
  Layers,
  Pin,
  PinOff,
  Share2,
  Star,
  StarOff,
  Trash2,
  Ungroup,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { CollectionSheet } from "@/components/collections/collection-sheet";
import { useEntryCommands, useUpdateEntry } from "@/lib/data/entries";
import { useGroupCommands } from "@/lib/data/groups";
import { useUser } from "@/lib/user-context";
import { GroupSheet } from "./group-sheet";
import { getSignedUrl } from "@/lib/data/signed-urls";
import type { Entry } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { useStash } from "@/components/shell/stash-context";

export function entryShareText(entry: Entry) {
  return [entry.title, entry.body, entry.description].filter(Boolean).join("\n\n");
}

export async function shareEntry(entry: Entry) {
  const text = entryShareText(entry);
  const url = entry.url ?? undefined;
  if (navigator.share) {
    try {
      // Share actual files when the platform supports it (Android, iOS, Windows).
      const shareable = entry.attachments.filter((a) => a.kind !== "file" || a.size_bytes < 20 * 1024 * 1024).slice(0, 5);
      if (shareable.length && "canShare" in navigator) {
        const files = (
          await Promise.all(
            shareable.map(async (a) => {
              const signed = await getSignedUrl(a.storage_path);
              if (!signed) return null;
              const blob = await (await fetch(signed)).blob();
              return new File([blob], a.file_name ?? "file", { type: a.mime_type ?? blob.type });
            }),
          )
        ).filter((f): f is File => !!f);
        if (files.length && navigator.canShare({ files })) {
          await navigator.share({ files, title: entry.title ?? undefined, text: text || url });
          return;
        }
      }
      await navigator.share({ title: entry.title ?? undefined, text: text || undefined, url });
      return;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
    }
  }
  await navigator.clipboard.writeText([text, url].filter(Boolean).join("\n"));
  toast.success("Copied to clipboard");
}

export function EntryActions({ entry, className, align = "end" }: { entry: Entry; className?: string; align?: "start" | "end" }) {
  const { openReminder, closeEntry } = useStash();
  const update = useUpdateEntry();
  const commands = useEntryCommands();
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const user = useUser();
  const groupCommands = useGroupCommands(user.id);

  const toggle = (patch: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: entry.id, patch }, { onError: (e) => toast.error(errorMessage(e)) });

  const closeIfOpen = () => {
    if (new URLSearchParams(window.location.search).get("entry") === entry.id) closeEntry();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent",
            className,
          )}
          aria-label="Entry actions"
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} onClick={(e) => e.stopPropagation()} className="w-56">
          <DropdownMenuItem onSelect={() => toggle({ is_pinned: !entry.is_pinned })}>
            {entry.is_pinned ? <PinOff /> : <Pin />} {entry.is_pinned ? "Unpin" : "Pin to top"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggle({ is_favorite: !entry.is_favorite })}>
            {entry.is_favorite ? <StarOff /> : <Star />} {entry.is_favorite ? "Remove favorite" : "Favorite"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCollectionsOpen(true)}>
            <FolderPlus /> Add to collection…
          </DropdownMenuItem>
          {entry.group_id ? (
            <DropdownMenuItem onSelect={() => groupCommands.removeEntries([entry]).catch((e) => toast.error(errorMessage(e)))}>
              <Ungroup /> Remove from group
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setGroupOpen(true)}>
              <Layers /> Add to group…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => openReminder({ entryId: entry.id, title: entry.title ?? undefined })}>
            <Bell /> Remind me…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {entry.url && (
            <DropdownMenuItem onSelect={() => window.open(entry.url!, "_blank", "noopener,noreferrer")}>
              <ExternalLink /> Open link
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void shareEntry(entry)}>
            <Share2 /> Share…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              await navigator.clipboard.writeText(entry.url ?? entryShareText(entry));
              toast.success("Copied");
            }}
          >
            <Copy /> Copy {entry.url ? "link" : "text"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              closeIfOpen();
              commands.setArchived([entry.id], !entry.is_archived).catch((e) => toast.error(errorMessage(e)));
            }}
          >
            {entry.is_archived ? <ArchiveRestore /> : <Archive />} {entry.is_archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => commands.remove([entry.id], closeIfOpen)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* React events bubble through portals; keep sheet clicks from reaching the card. */}
      <div className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <CollectionSheet open={collectionsOpen} onOpenChange={setCollectionsOpen} entries={[entry]} />
        <GroupSheet open={groupOpen} onOpenChange={setGroupOpen} entries={[entry]} />
      </div>
    </>
  );
}

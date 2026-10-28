"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Copy,
  Ellipsis,
  ExternalLink,
  Folder,
  Pin,
  PinOff,
  Share2,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { confirm } from "@/components/ui/confirm";
import { useCollections } from "@/lib/data/collections";
import { setEntryCollections, useDeleteEntries, useUpdateEntry } from "@/lib/data/entries";
import { invalidateData } from "@/lib/data/keys";
import { getSignedUrl } from "@/lib/data/signed-urls";
import { useUser } from "@/lib/user-context";
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
  const user = useUser();
  const qc = useQueryClient();
  const { openReminder } = useStash();
  const update = useUpdateEntry();
  const del = useDeleteEntries();
  const { data: collections } = useCollections();

  const patch = (p: Parameters<typeof update.mutate>[0]["patch"], message?: string) =>
    update.mutate(
      { id: entry.id, patch: p },
      {
        onSuccess: () => message && toast.success(message),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  async function toggleCollection(id: string) {
    const next = entry.collection_ids.includes(id) ? entry.collection_ids.filter((c) => c !== id) : [...entry.collection_ids, id];
    try {
      await setEntryCollections(user.id, entry.id, next);
      await invalidateData(qc);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: "Delete this entry?",
      description: entry.attachments.length
        ? `This also deletes ${entry.attachments.length} attached file${entry.attachments.length > 1 ? "s" : ""}. This can't be undone.`
        : "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    del.mutate([entry.id], {
      onSuccess: () => toast.success("Deleted"),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
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
        <DropdownMenuItem onSelect={() => patch({ is_pinned: !entry.is_pinned }, entry.is_pinned ? "Unpinned" : "Pinned")}>
          {entry.is_pinned ? <PinOff /> : <Pin />} {entry.is_pinned ? "Unpin" : "Pin to top"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => patch({ is_favorite: !entry.is_favorite })}>
          {entry.is_favorite ? <StarOff /> : <Star />} {entry.is_favorite ? "Remove favorite" : "Favorite"}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Folder /> Collections
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {collections?.length ? (
              collections.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={entry.collection_ids.includes(c.id)}
                  onSelect={(e) => {
                    e.preventDefault();
                    void toggleCollection(c.id);
                  }}
                >
                  <span className="truncate">{c.name}</span>
                </DropdownMenuCheckboxItem>
              ))
            ) : (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">No collections yet</p>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
        <DropdownMenuItem onSelect={() => patch({ is_archived: !entry.is_archived }, entry.is_archived ? "Restored" : "Archived")}>
          {entry.is_archived ? <ArchiveRestore /> : <Archive />} {entry.is_archived ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={() => void onDelete()}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

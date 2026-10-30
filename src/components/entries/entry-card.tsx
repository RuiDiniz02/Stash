"use client";

import { memo, useState } from "react";
import { format, isPast } from "date-fns";
import { Bell, Check, CloudOff, Folder, Hash, Layers, Pin, Repeat, Star } from "lucide-react";
import { useCollections } from "@/lib/data/collections";
import { useGroups } from "@/lib/data/groups";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStash } from "@/components/shell/stash-context";
import { Lightbox } from "@/components/media/lightbox";
import { AttachmentAudio, AttachmentFile, MediaGrid } from "./media";
import { LinkCard } from "./link-card";
import { EntryActions } from "./entry-actions";
import { useSelection } from "./selection";
import { useEntryDnd, useInboxDnd } from "./dnd";

function nextReminder(entry: Entry) {
  return entry.reminders.find((r) => !r.completed_at) ?? null;
}

export const EntryCard = memo(function EntryCard({
  entry,
  layout = "list",
  inGroup = false,
  noDrag = false,
}: {
  entry: Entry;
  layout?: "list" | "grid";
  /** Rendered inside a group card (hides the group chip). */
  inGroup?: boolean;
  /** Not draggable (e.g. the pinned strip, which repeats entries from the list). */
  noDrag?: boolean;
}) {
  const { openEntry } = useStash();
  const { data: collections } = useCollections();
  const { data: groups } = useGroups();
  const selection = useSelection();
  const dnd = useInboxDnd();
  const drag = useEntryDnd(entry, noDrag);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const visual = entry.attachments.filter((a) => a.kind === "image" || a.kind === "video");
  const audio = entry.attachments.filter((a) => a.kind === "audio");
  const files = entry.attachments.filter((a) => a.kind === "file");
  const reminder = nextReminder(entry);
  const entryCollections = (collections ?? []).filter((c) => entry.collection_ids.includes(c.id));
  const group = !inGroup && entry.group_id ? groups?.find((g) => g.id === entry.group_id) : undefined;
  const targetGroup = entry.group_id ? groups?.find((g) => g.id === entry.group_id) : undefined;
  const isGrid = layout === "grid";
  const selecting = !!selection?.active && !entry.pending;
  const selected = !!selection?.isSelected(entry.id);

  const activate = () => {
    if (entry.pending || dnd?.justDragged()) return;
    if (selecting) selection!.toggle(entry.id);
    else openEntry(entry.id);
  };

  return (
    <article
      ref={drag.setNodeRef}
      {...drag.dragProps}
      role="button"
      tabIndex={0}
      aria-label={entry.title ?? entry.body?.slice(0, 60) ?? entry.url ?? "Entry"}
      aria-pressed={selecting ? selected : undefined}
      aria-roledescription={drag.enabled ? "draggable entry" : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      onContextMenu={(e) => drag.enabled && e.preventDefault()}
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-2xl border bg-card p-3 text-left shadow-soft transition-[box-shadow,border-color,transform,opacity] duration-200 outline-none select-none [-webkit-touch-callout:none] hover:border-border hover:shadow-float focus-visible:ring-3 focus-visible:ring-ring/40 animate-fade-up sm:select-auto",
        drag.enabled && "touch-manipulation",
        isGrid && "mb-3 break-inside-avoid",
        entry.pending && "opacity-70",
        selected && "ring-2 ring-primary",
        selecting && "pl-11",
        drag.isDragging && "opacity-40",
        drag.isOver && "scale-[0.97] ring-2 ring-primary shadow-float",
      )}
    >
      {drag.isOver && (
        <span className="pointer-events-none absolute inset-x-0 -top-3 z-20 mx-auto w-fit rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground shadow">
          {targetGroup ? `Add to ${targetGroup.title}` : "Create group"}
        </span>
      )}
      {selection && !entry.pending && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? "Deselect entry" : "Select entry"}
          onClick={(e) => {
            e.stopPropagation();
            if (selection.active) selection.toggle(entry.id);
            else selection.start(entry.id);
          }}
          className={cn(
            "absolute top-3 left-3 z-10 grid size-6 place-items-center rounded-full border-2 transition",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-card",
            !selecting && "hidden sm:grid sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
          )}
        >
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </button>
      )}
      {(entry.title || entry.is_pinned || entry.is_favorite) && (
        <div className="flex items-start gap-2 pr-8">
          {entry.title && <h3 className="min-w-0 flex-1 text-[15px] leading-snug font-semibold tracking-tight">{entry.title}</h3>}
          <div className={cn("flex items-center gap-1 pt-0.5", !entry.title && "flex-1")}>
            {entry.is_pinned && <Pin className="size-3.5 fill-current text-primary" aria-label="Pinned" />}
            {entry.is_favorite && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Favorite" />}
          </div>
        </div>
      )}

      {visual.length > 0 && <MediaGrid items={visual} onOpen={selecting ? undefined : setLightbox} className={cn(!isGrid && "max-w-md")} />}

      {entry.body && (
        <p
          className={cn(
            "text-[15px] leading-relaxed break-words whitespace-pre-wrap",
            isGrid ? "line-clamp-6" : "line-clamp-[10]",
            !entry.title && !entry.is_pinned && !entry.is_favorite && "pr-8",
          )}
        >
          {entry.body}
        </p>
      )}

      {entry.url && <LinkCard url={entry.url} preview={entry.link_preview} compact={!isGrid && visual.length > 0} className={cn(!isGrid && "max-w-md")} />}

      {entry.description && <p className="line-clamp-3 text-sm text-muted-foreground">{entry.description}</p>}

      {audio.map((a) => (
        <AttachmentAudio key={a.id} att={a} compact />
      ))}
      {files.slice(0, 3).map((a) => (
        <AttachmentFile key={a.id} att={a} />
      ))}
      {files.length > 3 && <p className="text-xs text-muted-foreground">+{files.length - 3} more files</p>}

      <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <time dateTime={entry.created_at}>{format(new Date(entry.created_at), "HH:mm")}</time>
        {entry.pending && (
          <span className="inline-flex items-center gap-1 text-warning">
            <CloudOff className="size-3" /> Waiting to sync
          </span>
        )}
        {reminder && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
              isPast(new Date(reminder.due_at)) ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary",
            )}
          >
            {reminder.repeat !== "none" ? <Repeat className="size-3" /> : <Bell className="size-3" />}
            {format(new Date(reminder.due_at), reminder.all_day ? "EEE d MMM" : "EEE d MMM, HH:mm")}
          </span>
        )}
        {group && (
          <span className="inline-flex items-center gap-1">
            <Layers className="size-3" />
            {group.title}
          </span>
        )}
        {entryCollections.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1">
            <Folder className="size-3" />
            {c.name}
          </span>
        ))}
        {entry.tags.map((t) => (
          <span key={t.id} className="inline-flex items-center">
            <Hash className="size-3" />
            {t.name}
          </span>
        ))}
      </footer>

      {!entry.pending && !selecting && (
        <div className="absolute top-2 right-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:has-[[data-state=open]]:opacity-100">
          <EntryActions entry={entry} />
        </div>
      )}

      {visual.length > 0 && (
        // React events bubble through portals; keep lightbox clicks from opening the entry.
        <div className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Lightbox
            items={visual.map((a) => ({ ...a, sourceUrl: entry.url, caption: entry.title }))}
            index={lightbox}
            onIndexChange={setLightbox}
            onClose={() => setLightbox(null)}
          />
        </div>
      )}
    </article>
  );
});

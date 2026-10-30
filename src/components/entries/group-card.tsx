"use client";

import { useState } from "react";
import { Check, ChevronDown, Ellipsis, FileText, Layers, Link2, Mic, Pencil, Plus, StickyNote, Ungroup } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { useGroupCommands } from "@/lib/data/groups";
import { useLocalState } from "@/hooks/use-local-state";
import { useUser } from "@/lib/user-context";
import type { Entry, EntryGroup } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { AttachmentImage } from "./media";
import { EntryCard } from "./entry-card";
import { useSelection } from "./selection";

function MemberPreview({ entry }: { entry: Entry }) {
  const image = entry.attachments.find((a) => a.kind === "image");
  if (image) return <AttachmentImage att={image} className="size-full" />;
  if (entry.link_preview?.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.link_preview.image} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />;
  }
  const Icon = entry.url ? Link2 : entry.kind === "audio" ? Mic : entry.kind === "file" ? FileText : StickyNote;
  return (
    <span className="grid size-full place-items-center bg-muted text-muted-foreground">
      <Icon className="size-4" />
    </span>
  );
}

/** A group of entries in the Inbox: collapsed shows a compact preview, expanded shows every entry. */
export function GroupCard({ group, entries, layout }: { group: Pick<EntryGroup, "id" | "title">; entries: Entry[]; layout: "list" | "grid" }) {
  const user = useUser();
  const commands = useGroupCommands(user.id);
  const selection = useSelection();
  const [open, setOpen] = useLocalState(`stash-group-open-${group.id}`, false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.title);
  const ids = entries.map((e) => e.id);
  const allSelected = !!selection?.active && ids.every((id) => selection.isSelected(id));
  const summary = entries.map((e) => e.title || e.link_preview?.title || e.body?.split("\n")[0] || e.attachments[0]?.file_name).filter(Boolean);

  async function saveTitle() {
    setRenaming(false);
    const next = title.trim();
    if (!next || next === group.title) {
      setTitle(group.title);
      return;
    }
    try {
      await commands.rename(group.id, next);
    } catch (err) {
      setTitle(group.title);
      toast.error(errorMessage(err));
    }
  }

  const headerClick = () => {
    if (selection?.active) selection.setMany(ids, !allSelected);
    else setOpen(!open);
  };

  return (
    <section
      aria-label={`Group ${group.title}`}
      className={cn(
        "relative rounded-2xl border bg-card shadow-soft animate-fade-up",
        layout === "grid" && "mb-3 break-inside-avoid",
        allSelected && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center gap-2.5 p-3">
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Layers className="size-4" />
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setTitle(group.title);
                  setRenaming(false);
                }
              }}
              maxLength={120}
              aria-label="Group name"
              className="h-9 min-w-0 flex-1 rounded-lg border border-primary/50 bg-card px-2.5 text-[16px] font-semibold outline-none sm:text-[15px]"
            />
          </div>
        ) : (
          <button type="button" onClick={headerClick} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                allSelected ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
              )}
            >
              {allSelected ? <Check className="size-4" strokeWidth={3} /> : <Layers className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold tracking-tight">{group.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {entries.length} {entries.length === 1 ? "item" : "items"}
                {!open && summary.length > 0 && ` · ${summary.slice(0, 3).join(" · ")}`}
              </span>
            </span>
          </button>
        )}
        {!selection?.active && (
          <DropdownMenu>
            <DropdownMenuTrigger className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent data-[state=open]:bg-accent" aria-label="Group actions">
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => selection?.start(undefined, group)}>
                <Plus /> Add entries…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => commands.ungroup(group).catch((e) => toast.error(errorMessage(e)))}>
                <Ungroup /> Ungroup
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Collapse group" : "Expand group"}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="flex gap-1.5 px-3 pb-3" aria-label="Expand group">
          {entries.slice(0, 5).map((e) => (
            <span key={e.id} className="relative size-14 overflow-hidden rounded-lg border">
              <MemberPreview entry={e} />
            </span>
          ))}
          {entries.length > 5 && (
            <span className="grid size-14 place-items-center rounded-lg border bg-muted text-xs font-medium text-muted-foreground">
              +{entries.length - 5}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="flex flex-col gap-2 border-t bg-muted/30 p-2 animate-in fade-in-0">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} layout="list" inGroup />
          ))}
        </div>
      )}
    </section>
  );
}

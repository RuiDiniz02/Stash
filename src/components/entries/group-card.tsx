"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, ChevronDown, Ellipsis, FileText, FolderPlus, Layers, Link2, Mic, Pencil, Plus, StickyNote, Ungroup } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { useGroupCommands } from "@/lib/data/groups";
import { useUser } from "@/lib/user-context";
import type { Entry, EntryGroup } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { AttachmentImage } from "./media";
import { EntryCard } from "./entry-card";
import { SelectionProvider, useSelection } from "./selection";
import { SelectionBar } from "./selection-bar";
import { useGroupDrop, useInboxDnd } from "./dnd";
import { fetchGroupEntries, useEntries } from "@/lib/data/entries";
import { QuickComposer } from "@/components/capture/quick-composer";
import { Button } from "@/components/ui/button";
import { ErrorState, Spinner } from "@/components/ui/misc";
import { useContextPress } from "@/hooks/use-context-press";
import { useQueuedEntries } from "@/hooks/use-queued-entries";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const GroupEntryPicker = dynamic(() => import("./group-entry-picker").then((m) => m.GroupEntryPicker), { ssr: false });
const CollectionSheet = dynamic(() => import("@/components/collections/collection-sheet").then((m) => m.CollectionSheet), { ssr: false });

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
export function GroupCard({ group, entries, layout, contextCollectionId }: { group: EntryGroup; entries: Entry[]; layout: "list" | "grid"; contextCollectionId?: string }) {
  const user = useUser();
  const commands = useGroupCommands(user.id);
  const selection = useSelection();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collectionEntries, setCollectionEntries] = useState<Entry[] | null>(null);
  const [selectionIds, setSelectionIds] = useState<string[] | null>(null);
  const press = useContextPress(() => setMenuOpen(true), !selection?.active);
  const members = useEntries({ groupId: group.id }, open);
  const queued = useQueuedEntries({ groupId: group.id });
  const fetched = members.data?.pages.flat() ?? entries;
  const loadedMembers = [...queued.filter((entry) => !fetched.some((member) => member.id === entry.id)), ...fetched];
  const [title, setTitle] = useState(group.title);
  const dnd = useInboxDnd();
  const drop = useGroupDrop(group);
  const ref = useRef<HTMLElement | null>(null);
  const cancelled = useRef(false);

  // A group made by dropping one entry on another asks for its name straight away.
  useEffect(() => {
    if (dnd?.namingGroupId !== group.id) return;
    dnd.doneNaming();
    setTitle(group.title);
    setRenaming(true);
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [dnd, group.id, group.title]);

  useEffect(() => setTitle(group.title), [group.title]);
  const ids = selectionIds ?? entries.map((e) => e.id);
  const allSelected = !!selection?.active && ids.every((id) => selection.isSelected(id));
  const summary = entries.map((e) => e.title || e.link_preview?.title || e.body?.split("\n")[0] || e.attachments[0]?.file_name).filter(Boolean);

  async function saveTitle() {
    setRenaming(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = title.trim();
    if (!next) {
      setTitle(group.title);
      return;
    }
    // Confirming a name saves the group as a collection, even if the suggestion is kept.
    if (next === group.title && group.collection_id) return;
    try {
      const { linkedNow } = await commands.rename(group.id, next);
      if (linkedNow) toast.success(`Saved to Collections as “${next}”`);
    } catch (err) {
      setTitle(group.title);
      toast.error(errorMessage(err));
    }
  }

  const headerClick = () => {
    if (press.suppressClick()) return;
    if (selection?.active) {
      void fetchGroupEntries(group.id).then((all) => {
        const allIds = all.map((entry) => entry.id);
        setSelectionIds(allIds);
        selection.setMany(allIds, !allSelected, all);
      }).catch((error) => toast.error(errorMessage(error)));
    }
    else setOpen(!open);
  };

  return (
    <section
      ref={(node) => {
        ref.current = node;
        drop.setNodeRef(node);
      }}
      aria-label={`Group ${group.title}`}
      {...press.handlers}
      onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("article")) press.handlers.onPointerDown(event); }}
      onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true); }}
      className={cn(
        "entry-content relative w-full rounded-2xl border bg-card shadow-soft transition-[transform,box-shadow] duration-200 animate-fade-up",
        layout === "grid" && "mb-3 break-inside-avoid",
        allSelected && "ring-2 ring-primary",
        drop.isOver && "scale-[0.98] ring-2 ring-primary shadow-float",
      )}
    >
      {drop.isOver && (
        <span className="pointer-events-none absolute inset-x-0 -top-3 z-20 mx-auto w-fit rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground shadow">
          Add to {group.title}
        </span>
      )}
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
                  cancelled.current = true;
                  setTitle(group.title);
                  setRenaming(false);
                }
              }}
              maxLength={60}
              aria-label="Group name"
              placeholder="Name this group"
              className="h-9 min-w-0 flex-1 rounded-lg border border-primary/50 bg-card px-2.5 text-[16px] font-semibold outline-none sm:text-[15px]"
            />
          </div>
        ) : (
          <button type="button" {...press.handlers} onClick={headerClick} aria-label={`Open group ${group.title}, ${group.entry_count} items`} aria-haspopup="dialog" aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
                {group.entry_count} {group.entry_count === 1 ? "item" : "items"}
                {!open && summary.length > 0 && ` · ${summary.slice(0, 3).join(" · ")}`}
              </span>
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        )}
        {!selection?.active && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent data-[state=open]:bg-accent" aria-label="Group actions">
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="mobile-action-menu">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdding(true)}>
                <Plus /> Add entries…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {
                void fetchGroupEntries(group.id).then(setCollectionEntries).catch((error) => toast.error(errorMessage(error)));
              }}><FolderPlus /> Add group to collection…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => commands.ungroup(group).catch((e) => toast.error(errorMessage(e)))}>
                <Ungroup /> Ungroup
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full min-w-0 flex-wrap gap-1.5 px-3 pb-3" aria-label="Expand group">
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

      <Dialog open={open} onOpenChange={setOpen}>
        <SelectionProvider>
        <DialogContent variant="right" aria-describedby={undefined} className="sm:w-[min(640px,100vw)]">
          <div className="shrink-0 border-b px-4 py-4 pr-14">
            <DialogTitle className="entry-content">{group.title}</DialogTitle>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{group.entry_count} items</p>
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus className="size-4" /> Add existing</Button>
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto bg-muted/30 p-3">
          {members.isLoading && <div className="grid place-items-center p-4"><Spinner /></div>}
          {members.error && <ErrorState error={members.error} onRetry={() => members.refetch()} />}
          {loadedMembers.map((e) => (
            <EntryCard key={e.id} entry={e} layout="list" inGroup noDrag contextCollectionId={contextCollectionId} />
          ))}
          {members.hasNextPage && <Button variant="ghost" disabled={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()}>Load more from this group</Button>}
          </div>
          <GroupFooter group={group} entries={loadedMembers} collectionId={contextCollectionId} />
        </DialogContent>
        </SelectionProvider>
      </Dialog>
      {adding && <GroupEntryPicker group={group} open={adding} onOpenChange={setAdding} />}
      {collectionEntries && <CollectionSheet entries={collectionEntries} open onOpenChange={(value) => { if (!value) setCollectionEntries(null); }} />}
    </section>
  );
}

function GroupFooter({ group, entries, collectionId }: { group: EntryGroup; entries: Entry[]; collectionId?: string }) {
  const selection = useSelection();
  return <div className="shrink-0 border-t bg-background p-3 pb-safe">
    {selection?.active ? <SelectionBar entries={entries} embedded /> : <QuickComposer groupId={group.id} collectionId={collectionId ?? group.collection_id ?? undefined} />}
  </div>;
}

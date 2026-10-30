"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, FolderPlus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, SheetHandle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { addEntriesToCollection, removeEntriesFromCollection, useCollectionMutations, useCollections } from "@/lib/data/collections";
import { invalidateData } from "@/lib/data/keys";
import { toastWithUndo } from "@/lib/undo";
import { useUser } from "@/lib/user-context";
import type { Entry } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { CollectionIcon } from "./collection-icon";

/**
 * Add one or many entries to collections, and create a collection on the spot.
 * Bottom sheet on mobile, centred dialog on desktop.
 */
export function CollectionSheet({
  open,
  onOpenChange,
  entries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: Pick<Entry, "id" | "collection_ids">[];
}) {
  const user = useUser();
  const qc = useQueryClient();
  const { data: collections, isLoading } = useCollections();
  const { create } = useCollectionMutations(user.id);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Local membership so toggles feel instant: collectionId -> number of selected entries in it.
  const [members, setMembers] = useState<Map<string, number>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useMemo(() => entries.map((e) => e.id), [entries]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const m = new Map<string, number>();
    for (const e of entries) for (const c of e.collection_ids) m.set(c, (m.get(c) ?? 0) + 1);
    setMembers(m);
    // Only reset when the sheet opens, not when the entries refetch underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = (collections ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  const exact = (collections ?? []).some((c) => c.name.toLowerCase() === q);
  const label = entries.length === 1 ? "entry" : `${entries.length} entries`;

  async function toggle(collectionId: string, name: string) {
    const inAll = (members.get(collectionId) ?? 0) === ids.length;
    setBusy(collectionId);
    setMembers((m) => new Map(m).set(collectionId, inAll ? 0 : ids.length));
    try {
      if (inAll) {
        await removeEntriesFromCollection(ids, collectionId);
        toastWithUndo(`Removed from ${name}`, async () => {
          await addEntriesToCollection(user.id, ids, collectionId);
          await invalidateData(qc);
        });
      } else {
        await addEntriesToCollection(user.id, ids, collectionId);
        toastWithUndo(`Added to ${name}`, async () => {
          await removeEntriesFromCollection(ids, collectionId);
          await invalidateData(qc);
        });
      }
      await invalidateData(qc);
    } catch (err) {
      toast.error(errorMessage(err));
      setMembers((m) => new Map(m).set(collectionId, inAll ? ids.length : 0));
    } finally {
      setBusy(null);
    }
  }

  async function createAndAdd() {
    const name = query.trim();
    if (!name) {
      inputRef.current?.focus();
      return;
    }
    setBusy("new");
    try {
      const [created] = await create.mutateAsync([{ name, icon: "folder", color: "indigo" }]);
      if (created) {
        await addEntriesToCollection(user.id, ids, created.id);
        setMembers((m) => new Map(m).set(created.id, ids.length));
        await invalidateData(qc);
        toast.success(`Created ${name} and added the ${label}`);
      }
      setQuery("");
    } catch (err) {
      const msg = errorMessage(err);
      toast.error(msg.includes("collections_user_name_idx") ? "A collection with that name already exists" : msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHandle />
        <div className="px-4 pt-4 pb-2">
          <DialogTitle className="text-[15px]">Add to collection</DialogTitle>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q && !exact) {
                  e.preventDefault();
                  void createAndAdd();
                }
              }}
              maxLength={60}
              placeholder="Find or create a collection"
              aria-label="Find or create a collection"
              className="h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-[16px] outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 sm:text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}

          {!isLoading && !collections?.length && !q && (
            <div className="flex flex-col items-center px-4 py-6 text-center">
              <span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <FolderPlus className="size-5" />
              </span>
              <p className="text-sm font-medium">No collections yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Type a name above to create your first one.</p>
              <Button size="sm" className="mt-4" onClick={() => inputRef.current?.focus()}>
                <Plus /> Create collection
              </Button>
            </div>
          )}

          {q && !exact && (
            <button
              type="button"
              onClick={() => void createAndAdd()}
              disabled={busy === "new"}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-primary-soft">
                {busy === "new" ? <Spinner className="text-primary" /> : <Plus className="size-4" />}
              </span>
              Create “{query.trim()}”
            </button>
          )}

          <ul>
            {filtered.map((c) => {
              const count = members.get(c.id) ?? 0;
              const all = count === ids.length;
              const some = count > 0 && !all;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={all ? true : some ? "mixed" : false}
                    onClick={() => void toggle(c.id, c.name)}
                    disabled={busy === c.id}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
                  >
                    <CollectionIcon icon={c.icon} color={c.color} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-md border-2 transition-colors",
                        all ? "border-primary bg-primary text-primary-foreground" : some ? "border-primary" : "border-muted-foreground/30",
                      )}
                    >
                      {all && <Check className="size-3.5" strokeWidth={3} />}
                      {some && <span className="h-0.5 w-2.5 rounded bg-primary" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {!isLoading && !!collections?.length && !q && (
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <span className="grid size-8 place-items-center rounded-lg border border-dashed">
                <Plus className="size-4" />
              </span>
              Create collection
            </button>
          )}
        </div>

        <div className="border-t px-4 py-3">
          <Button className="w-full" variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

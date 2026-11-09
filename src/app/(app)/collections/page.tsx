"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, CheckSquare, Ellipsis, FolderPlus, GripVertical, Pencil, Share2, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { confirm } from "@/components/ui/confirm";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import { CollectionIcon } from "@/components/collections/collection-icon";
import { ShareCollectionDialog } from "@/components/collections/share-collection-dialog";
import { SUGGESTED_COLLECTIONS, useCollectionMutations, useCollections } from "@/lib/data/collections";
import { useUser } from "@/lib/user-context";
import type { Collection } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

export default function CollectionsPage() {
  return (
    <Suspense>
      <Collections />
    </Suspense>
  );
}

function Collections() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const { data: collections, isLoading, error, refetch } = useCollections();
  const { create, remove, reorder } = useCollectionMutations(user.id);
  const [dialog, setDialog] = useState<{ open: boolean; collection: Collection | null }>({ open: false, collection: null });
  const [sharing, setSharing] = useState<Collection | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const selectionActive = selected !== null;
  const owned = collections?.filter((c) => c.user_id === user.id) ?? [];
  const selectedIds = owned.filter((c) => selected?.includes(c.id)).map((c) => c.id);

  useEffect(() => {
    if (!selectionActive) return;

    function leaveSelection(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-collection-selection-interactive], [role=dialog], [data-radix-popper-content-wrapper]")) return;
      setSelected(null);
    }

    function leaveSelectionWithKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector("[role=dialog]")) return;
      setSelected(null);
    }

    document.addEventListener("pointerdown", leaveSelection);
    document.addEventListener("keydown", leaveSelectionWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", leaveSelection);
      document.removeEventListener("keydown", leaveSelectionWithKeyboard);
    };
  }, [selectionActive]);

  useEffect(() => {
    if (params.get("new") === "1") {
      setDialog({ open: true, collection: null });
      router.replace("/collections");
    }
  }, [params, router]);

  function move(id: string, delta: number) {
    if (!collections) return;
    const ids = owned.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId || !owned.some((c) => c.id === targetId)) return;
    const ids = owned.map((c) => c.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    reorder.mutate(ids);
    setDragId(null);
  }

  async function onDelete(c: Collection) {
    const ok = await confirm({
      title: `Delete "${c.name}"?`,
      description: "Entries in this collection are kept — they just won't belong to it anymore.",
      confirmLabel: "Delete collection",
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(c.id, { onError: (e) => toast.error(errorMessage(e)) });
  }

  async function addSuggested() {
    const existing = new Set(owned.map((c) => c.name.toLowerCase()));
    const toAdd = SUGGESTED_COLLECTIONS.filter((s) => !existing.has(s.name.toLowerCase()));
    if (!toAdd.length) return;
    try {
      await create.mutateAsync(toAdd);
      toast.success(`Added ${toAdd.length} collections`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length || remove.isPending) return;
    const ok = await confirm({
      title: `Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? "collection" : "collections"}?`,
      description: "Notes are kept. If a collection is shared, its members lose access to it.",
      confirmLabel: "Delete selected",
      destructive: true,
    });
    if (!ok) return;
    try {
      const count = await remove.mutateAsync(selectedIds);
      setSelected(null);
      toast.success(`Deleted ${count} ${count === 1 ? "collection" : "collections"}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle={collections ? `${collections.length} collection${collections.length === 1 ? "" : "s"}` : undefined}
        actions={
          selected ? (
            <Button data-collection-selection-interactive size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setSelected(null)}>Done</Button>
          ) : (
            <>
              {owned.length > 0 && <Button size="icon" variant="ghost" aria-label="Select collections" onClick={() => setSelected([])}><CheckSquare /></Button>}
              <Button size="sm" onClick={() => setDialog({ open: true, collection: null })}><FolderPlus /> New collection</Button>
            </>
          )
        }
      />
      <div className="mx-auto max-w-5xl px-4 pt-4 md:px-8">
        {selected && (
          <div data-collection-selection-interactive className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground" aria-live="polite">{selectedIds.length} selected</span>
            <Button size="sm" variant="destructive" disabled={!selectedIds.length || remove.isPending} onClick={() => void deleteSelected()}>
              <Trash2 /> Delete selected
            </Button>
          </div>
        )}
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        )}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}
        {!selected && collections && collections.length === 0 && (
          <EmptyState
            icon={FolderPlus}
            title="Organize when you're ready"
            description="Collections group related entries. An entry can live in several collections at once."
            action={
              <div className="flex flex-col items-center gap-2 sm:flex-row">
                <Button onClick={() => setDialog({ open: true, collection: null })}>
                  <FolderPlus /> New collection
                </Button>
                <Button variant="outline" onClick={() => void addSuggested()} disabled={create.isPending}>
                  <Sparkles /> Add suggested
                </Button>
              </div>
            }
          />
        )}
        {collections && collections.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {collections.map((c) => (
              <li
                key={c.id}
                data-collection-selection-interactive={selected ? "" : undefined}
                draggable={!selected && c.access_role === "owner"}
                onDragStart={(e) => {
                  setDragId(c.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", c.id);
                }}
                onDragOver={(e) => dragId && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dropOn(c.id);
                }}
                onDragEnd={() => setDragId(null)}
                className={cn("group relative animate-fade-up", dragId === c.id && "opacity-40")}
              >
                {selected && c.access_role === "owner" ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selectedIds.includes(c.id)}
                    disabled={remove.isPending}
                    onClick={() => setSelected((prev) => prev?.includes(c.id) ? prev.filter((id) => id !== c.id) : [...(prev ?? []), c.id])}
                    className={cn("flex h-full min-h-28 w-full min-w-0 flex-col justify-between gap-4 rounded-2xl border bg-card p-4 text-left shadow-soft", selectedIds.includes(c.id) && "ring-2 ring-primary")}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <CollectionIcon icon={c.icon} color={c.color} size="lg" />
                      <span aria-hidden className="text-primary">{selectedIds.includes(c.id) ? "✓" : "○"}</span>
                    </span>
                    <span className="w-full min-w-0">
                      <span className="block truncate text-sm font-semibold">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.entry_count} item{c.entry_count === 1 ? "" : "s"}</span>
                    </span>
                  </button>
                ) : selected ? (
                  <div
                    aria-label={`${c.name}, shared with you, not selectable for deletion`}
                    className="flex h-full min-h-28 w-full min-w-0 flex-col justify-between gap-4 rounded-2xl border bg-card p-4 text-left opacity-65 shadow-soft"
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <CollectionIcon icon={c.icon} color={c.color} size="lg" />
                      <Users aria-hidden className="size-4 text-muted-foreground" />
                    </span>
                    <span className="w-full min-w-0">
                      <span className="block truncate text-sm font-semibold">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.entry_count} item{c.entry_count === 1 ? "" : "s"} · shared</span>
                    </span>
                  </div>
                ) : (<>
                <Link
                  href={`/collections/${c.id}`}
                  className="flex h-full min-h-28 flex-col justify-between gap-4 rounded-2xl border bg-card p-4 shadow-soft transition hover:shadow-float"
                >
                  <CollectionIcon icon={c.icon} color={c.color} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold tracking-tight">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.entry_count} item{c.entry_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
                {c.access_role === "owner" && <GripVertical aria-hidden className="absolute top-4 right-11 hidden size-4 cursor-grab text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 md:block" />}
                {(c.member_count ?? 0) + (c.pending_invite_count ?? 0) > 0 && (
                  <span className="pointer-events-none absolute top-3 right-12 grid size-7 place-items-center rounded-full border bg-card text-muted-foreground" role="img" aria-label={c.access_role === "owner" ? "Shared" : "Shared with you"}>
                    <Users className="size-3.5" />
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="absolute top-3 right-3 grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent data-[state=open]:bg-accent"
                    aria-label={`${c.name} options`}
                  >
                    <Ellipsis className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setSharing(c)}>
                      <Share2 /> {c.access_role === "owner" ? "Share & members" : "View members"}
                    </DropdownMenuItem>
                    {c.access_role === "owner" && (
                      <>
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, collection: c })}>
                          <Pencil /> Rename & style
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={owned[0]?.id === c.id} onSelect={() => move(c.id, -1)}>
                          <ArrowUp /> Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={owned.at(-1)?.id === c.id} onSelect={() => move(c.id, 1)}>
                          <ArrowDown /> Move down
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => void onDelete(c)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                </>)}
              </li>
            ))}
          </ul>
        )}
        {!selected && collections && collections.length > 0 && collections.length < SUGGESTED_COLLECTIONS.length && (
          <button onClick={() => void addSuggested()} className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Sparkles className="size-4" /> Add suggested collections
          </button>
        )}
      </div>
      <CollectionDialog
        open={dialog.open}
        collection={dialog.collection}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onCreated={(c) => router.push(`/collections/${c.id}`)}
      />
      <ShareCollectionDialog collection={sharing} open={!!sharing} onOpenChange={(open) => !open && setSharing(null)} />
    </>
  );
}

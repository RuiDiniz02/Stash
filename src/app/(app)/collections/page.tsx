"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Ellipsis, FolderPlus, GripVertical, Pencil, Plus, Share2, Sparkles, Trash2, Users } from "lucide-react";
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

  useEffect(() => {
    if (params.get("new") === "1") {
      setDialog({ open: true, collection: null });
      router.replace("/collections");
    }
  }, [params, router]);

  function move(id: string, delta: number) {
    if (!collections) return;
    const ids = collections.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  }

  function dropOn(targetId: string) {
    if (!collections || !dragId || dragId === targetId) return;
    const ids = collections.map((c) => c.id).filter((id) => id !== dragId);
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
    const existing = new Set((collections ?? []).map((c) => c.name.toLowerCase()));
    const toAdd = SUGGESTED_COLLECTIONS.filter((s) => !existing.has(s.name.toLowerCase()));
    if (!toAdd.length) return;
    try {
      await create.mutateAsync(toAdd);
      toast.success(`Added ${toAdd.length} collections`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle={collections ? `${collections.length} collection${collections.length === 1 ? "" : "s"}` : undefined}
        actions={
          <Button size="sm" onClick={() => setDialog({ open: true, collection: null })}>
            <Plus /> New
          </Button>
        }
      />
      <div className="mx-auto max-w-5xl px-4 pt-4 md:px-8">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        )}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}
        {collections && collections.length === 0 && (
          <EmptyState
            icon={FolderPlus}
            title="Organize when you're ready"
            description="Collections group related entries. An entry can live in several collections at once."
            action={
              <div className="flex flex-col items-center gap-2 sm:flex-row">
                <Button onClick={() => setDialog({ open: true, collection: null })}>
                  <Plus /> New collection
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
            {collections.map((c, i) => (
              <li
                key={c.id}
                draggable={c.access_role === "owner"}
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
                  <span className="pointer-events-none absolute top-3 left-3 inline-flex h-7 items-center gap-1 rounded-full border bg-card/95 px-2 text-[11px] font-medium text-muted-foreground shadow-soft">
                    <Users className="size-3" /> {c.access_role === "owner" ? "Shared" : "Shared with you"}
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
                        <DropdownMenuItem disabled={i === 0} onSelect={() => move(c.id, -1)}>
                          <ArrowUp /> Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={i === collections.length - 1} onSelect={() => move(c.id, 1)}>
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
              </li>
            ))}
          </ul>
        )}
        {collections && collections.length > 0 && collections.length < SUGGESTED_COLLECTIONS.length && (
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

"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Ellipsis, FolderOpen, Pencil, Share2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/nav";
import { QuickComposer } from "@/components/capture/quick-composer";
import { EntriesView, LayoutToggle, useLayoutPref } from "@/components/entries/entries-view";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import { CollectionIcon } from "@/components/collections/collection-icon";
import { ShareCollectionDialog } from "@/components/collections/share-collection-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { canEditCollection, useCollectionMutations, useCollections } from "@/lib/data/collections";
import { useUser } from "@/lib/user-context";
import { errorMessage } from "@/lib/utils";
import { SelectionProvider, useSelection } from "@/components/entries/selection";

export default function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SelectionProvider><CollectionContent id={id} /></SelectionProvider>;
}

function CollectionContent({ id }: { id: string }) {
  const selection = useSelection();
  const user = useUser();
  const router = useRouter();
  const { data: collections, isLoading } = useCollections();
  const { remove } = useCollectionMutations(user.id);
  const [layout, setLayout] = useLayoutPref("collection");
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const collection = collections?.find((c) => c.id === id);

  if (!isLoading && !collection) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Collection not found"
        description="It may have been deleted on another device."
        action={<Link href="/collections" className="text-sm font-medium text-primary">Back to collections</Link>}
      />
    );
  }

  return (
    <>
      <PageHeader
        back={
          <Link href="/collections" className="-ml-2 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Back to collections">
            <ChevronLeft className="size-5" />
          </Link>
        }
        title={
          <span className="flex min-w-0 items-center gap-2">
            {collection && <CollectionIcon icon={collection.icon} color={collection.color} size="sm" className="size-6 rounded-md" />}
            <span className="truncate">{collection?.name ?? " "}</span>
          </span>
        }
        subtitle={collection ? `${collection.entry_count} item${collection.entry_count === 1 ? "" : "s"}${collection.access_role && collection.access_role !== "owner" ? ` · ${collection.access_role === "editor" ? "Editor" : "View only"}` : ""}` : undefined}
        actions={
          <>
            <LayoutToggle value={layout} onChange={setLayout} />
            {collection && (
              <>
                <button
                  type="button"
                  onClick={() => setSharing(true)}
                  className="relative grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
                  aria-label={collection.access_role === "owner" ? "Share collection" : "View collection members"}
                >
                  {collection.access_role === "owner" ? <Share2 className="size-4" /> : <Users className="size-4" />}
                  {(collection.member_count ?? 0) > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-primary" />}
                </button>
                {collection.access_role === "owner" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Collection options">
                      <Ellipsis className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(true)}>
                        <Pencil /> Rename & style
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        destructive
                        onSelect={async () => {
                          const ok = await confirm({
                            title: `Delete "${collection.name}"?`,
                            description: "Entries are kept — they just won't belong to this collection.",
                            confirmLabel: "Delete collection",
                            destructive: true,
                          });
                          if (!ok) return;
                          remove.mutate(collection.id, {
                            onSuccess: () => router.replace("/collections"),
                            onError: (e) => toast.error(errorMessage(e)),
                          });
                        }}
                      >
                        <Trash2 /> Delete collection
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </>
        }
      />
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className={layout === "list" ? "mx-auto max-w-2xl" : undefined}>
          <div className="h-4" />
          <EntriesView filter={{ collectionId: id }} layout={layout} />
        </div>
      </div>
      {!selection?.active && canEditCollection(collection) && <QuickComposer key={id} collectionId={id} docked />}
      <CollectionDialog open={editing} onOpenChange={setEditing} collection={collection} />
      <ShareCollectionDialog
        collection={collection ?? null}
        open={sharing}
        onOpenChange={setSharing}
        onLeft={() => router.replace("/collections")}
      />
    </>
  );
}

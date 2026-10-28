"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Ellipsis, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/nav";
import { QuickComposer } from "@/components/capture/quick-composer";
import { EntriesView, LayoutToggle, useLayoutPref } from "@/components/entries/entries-view";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import { CollectionIcon } from "@/components/collections/collection-icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { useCollectionMutations, useCollections } from "@/lib/data/collections";
import { useUser } from "@/lib/user-context";
import { errorMessage } from "@/lib/utils";

export default function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useUser();
  const router = useRouter();
  const { data: collections, isLoading } = useCollections();
  const { remove } = useCollectionMutations(user.id);
  const [layout, setLayout] = useLayoutPref("collection");
  const [editing, setEditing] = useState(false);
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
          <span className="flex items-center gap-2">
            {collection && <CollectionIcon icon={collection.icon} color={collection.color} size="sm" className="size-6 rounded-md" />}
            {collection?.name ?? " "}
          </span>
        }
        subtitle={collection ? `${collection.entry_count} item${collection.entry_count === 1 ? "" : "s"}` : undefined}
        actions={
          <>
            <LayoutToggle value={layout} onChange={setLayout} />
            {collection && (
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
        }
      />
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className={layout === "list" ? "mx-auto max-w-2xl" : undefined}>
          <div className="pt-3 pb-5">
            <QuickComposer collectionId={id} />
          </div>
          <EntriesView filter={{ collectionId: id }} layout={layout} />
        </div>
      </div>
      <CollectionDialog open={editing} onOpenChange={setEditing} collection={collection} />
    </>
  );
}

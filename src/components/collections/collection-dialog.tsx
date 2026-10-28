"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, SheetHandle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useCollectionMutations } from "@/lib/data/collections";
import { useUser } from "@/lib/user-context";
import type { Collection } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { COLLECTION_COLORS, COLLECTION_ICONS, CollectionIcon, collectionTint } from "./collection-icon";

export function CollectionDialog({
  open,
  onOpenChange,
  collection,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  collection?: Collection | null;
  onCreated?: (c: Collection) => void;
}) {
  const user = useUser();
  const { create, update } = useCollectionMutations(user.id);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [color, setColor] = useState("indigo");

  useEffect(() => {
    if (!open) return;
    setName(collection?.name ?? "");
    setIcon(collection?.icon ?? "folder");
    setColor(collection?.color ?? "indigo");
  }, [open, collection]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (collection) {
        await update.mutateAsync({ id: collection.id, patch: { name: trimmed, icon, color } });
      } else {
        const [created] = await create.mutateAsync([{ name: trimmed, icon, color }]);
        if (created) onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      const msg = errorMessage(err);
      toast.error(msg.includes("collections_user_name_idx") ? "You already have a collection with that name" : msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <SheetHandle />
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{collection ? "Edit collection" : "New collection"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-5 pb-2">
            <div className="flex items-center gap-3">
              <CollectionIcon icon={icon} color={color} size="lg" />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="col-name">Name</Label>
                <Input id="col-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="e.g. Photography" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="grid grid-cols-8 gap-1.5">
                {Object.entries(COLLECTION_ICONS).map(([key, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    aria-label={key}
                    aria-pressed={icon === key}
                    className={cn(
                      "grid aspect-square place-items-center rounded-lg border transition-colors",
                      icon === key ? "border-primary/50 bg-primary-soft text-primary" : "border-transparent text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(COLLECTION_COLORS).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={c}
                    aria-pressed={color === c}
                    style={{ background: collectionTint(c).color }}
                    className={cn("size-7 rounded-full ring-offset-2 ring-offset-popover transition", color === c && "ring-2 ring-foreground/60")}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending || update.isPending}>
              {collection ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { canEditCollection, useCollectionMutations, useCollections } from "@/lib/data/collections";
import { CollectionIcon } from "@/components/collections/collection-icon";
import { useUser } from "@/lib/user-context";
import { cn, errorMessage } from "@/lib/utils";

/** Multi-select chips for collections, with inline creation. */
export function CollectionPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const user = useUser();
  const { data: collections } = useCollections();
  const { create } = useCollectionMutations(user.id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  async function submitNew() {
    const trimmed = name.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    try {
      const [created] = await create.mutateAsync([{ name: trimmed, icon: "folder", color: "indigo" }]);
      if (created) {
        onChange([...value, created.id]);
        toast.success(`Created ${created.name}`);
      }
      setName("");
      setAdding(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't create collection"));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {collections?.filter(canEditCollection).map((c) => {
        const selected = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(c.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border pr-3 pl-1 text-[13px] transition-colors",
              selected ? "border-primary/40 bg-primary-soft font-medium text-foreground" : "bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            {selected ? (
              <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3.5" />
              </span>
            ) : (
              <CollectionIcon icon={c.icon} color={c.color} size="sm" className="size-6 rounded-full" />
            )}
            {c.name}
          </button>
        );
      })}
      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitNew();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setAdding(false);
            }
          }}
          onBlur={() => void submitNew()}
          maxLength={60}
          placeholder="Collection name"
          className="h-8 w-40 rounded-full border border-primary/50 bg-card px-3 text-[13px] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-[13px] hover:bg-accent hover:text-foreground",
            collections?.length ? "text-muted-foreground" : "border-primary/50 text-primary",
          )}
        >
          <Plus className="size-3.5" /> Create collection
        </button>
      )}
      {!adding && collections && collections.length === 0 && (
        <p className="w-full text-xs text-muted-foreground">No collections yet. Create one and this entry goes straight into it.</p>
      )}
    </div>
  );
}

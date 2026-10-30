"use client";

import { useState } from "react";
import { Archive, FolderPlus, Layers, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CollectionSheet } from "@/components/collections/collection-sheet";
import { useEntryCommands } from "@/lib/data/entries";
import { useGroupCommands } from "@/lib/data/groups";
import { useUser } from "@/lib/user-context";
import type { Entry } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { GroupSheet } from "./group-sheet";
import { useSelection } from "./selection";

/** Floating action bar for multi-select: group, add to collection, archive, delete. */
export function SelectionBar({ entries }: { entries: Entry[] }) {
  const selection = useSelection();
  const user = useUser();
  const commands = useEntryCommands();
  const groupCommands = useGroupCommands(user.id);
  const [groupOpen, setGroupOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  if (!selection?.active) return null;

  const chosen = entries.filter((e) => selection.selected.has(e.id));
  const ids = chosen.map((e) => e.id);
  const none = chosen.length === 0;
  const target = selection.target;

  const onGroup = async () => {
    if (!target) return setGroupOpen(true);
    try {
      await groupCommands.add(target, chosen);
      selection.clear();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label="Selected entries"
        className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md animate-in fade-in-0 slide-in-from-bottom-4 md:bottom-6"
      >
        <div className="flex items-center gap-1 rounded-2xl border bg-popover p-1.5 shadow-float">
          <button
            onClick={selection.clear}
            aria-label="Cancel selection"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
          >
            <X className="size-[18px]" />
          </button>
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium tabular-nums">
            {target ? `Add to ${target.title}` : none ? "Select entries" : `${chosen.length} selected`}
          </span>
          <BarButton label={target ? "Add" : "Group"} icon={Layers} disabled={none} onClick={() => void onGroup()} primary={!!target} />
          {!target && (
            <>
              <BarButton label="Collection" icon={FolderPlus} disabled={none} onClick={() => setCollectionOpen(true)} />
              <BarButton
                label="Archive"
                icon={Archive}
                disabled={none}
                onClick={() => {
                  commands.setArchived(ids, true).catch((e) => toast.error(errorMessage(e)));
                  selection.clear();
                }}
              />
              <BarButton
                label="Delete"
                icon={Trash2}
                disabled={none}
                destructive
                onClick={() => {
                  commands.remove(ids);
                  selection.clear();
                }}
              />
            </>
          )}
        </div>
      </div>
      <GroupSheet open={groupOpen} onOpenChange={setGroupOpen} entries={chosen} onDone={selection.clear} />
      <CollectionSheet
        open={collectionOpen}
        onOpenChange={(open) => {
          setCollectionOpen(open);
          if (!open) selection.clear();
        }}
        entries={chosen}
      />
    </>
  );
}

function BarButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  destructive,
  primary,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 min-w-10 shrink-0 flex-col items-center justify-center rounded-xl px-2 text-[10px] font-medium transition-colors disabled:opacity-40",
        primary ? "bg-primary px-3 text-primary-foreground" : destructive ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-[18px]" />
      <span className="hidden sm:block">{label}</span>
    </button>
  );
}

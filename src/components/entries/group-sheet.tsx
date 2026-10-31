"use client";

import { useEffect, useState } from "react";
import { Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, SheetHandle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suggestGroupTitle, useGroupCommands, useGroups } from "@/lib/data/groups";
import { useUser } from "@/lib/user-context";
import type { Entry } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

/** Group entries into a new group, or add them to an existing one. */
export function GroupSheet({
  open,
  onOpenChange,
  entries,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: Entry[];
  onDone?: () => void;
}) {
  const user = useUser();
  const { data: groups } = useGroups();
  const commands = useGroupCommands(user.id);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setTitle(suggestGroupTitle(entries));
    // Suggest once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const currentGroups = new Set(entries.map((e) => e.group_id));
  const others = (groups ?? []).filter((g) => !(currentGroups.size === 1 && currentGroups.has(g.id)));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <SheetHandle />
        <form
          className="px-4 pt-4 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) void run(() => commands.create(title, entries));
          }}
        >
          <DialogTitle className="text-[15px]">
            Group {entries.length === 1 ? "entry" : `${entries.length} entries`}
          </DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Entries stay where they are — nothing is copied.</p>
          <div className="mt-3 flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Group name" aria-label="Group name" autoFocus />
            <Button type="submit" disabled={!title.trim() || busy}>
              <Plus /> Create
            </Button>
          </div>
        </form>
        {others.length > 0 && (
          <div className="min-h-0 flex-1 overflow-y-auto border-t px-2 py-2">
            <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">Or add to a group</p>
            <ul>
              {others.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => commands.add(g, entries))}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
                      <Layers className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{g.entry_count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

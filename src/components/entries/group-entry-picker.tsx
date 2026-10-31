"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, SheetHandle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ErrorState, Spinner } from "@/components/ui/misc";
import { useEntries } from "@/lib/data/entries";
import { useGroupCommands } from "@/lib/data/groups";
import { useUser } from "@/lib/user-context";
import { errorMessage } from "@/lib/utils";
import type { EntryGroup } from "@/lib/types";

/** A picker independent of the current Inbox filter. */
export function GroupEntryPicker({ group, open, onOpenChange }: { group: EntryGroup; open: boolean; onOpenChange: (value: boolean) => void }) {
  const query = useEntries({ view: "inbox" }, open);
  const user = useUser();
  const commands = useGroupCommands(user.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const entries = (query.data?.pages.flat() ?? []).filter((e) => e.group_id !== group.id);
  const filtered = entries.filter((e) => [e.title, e.body, e.url].some((value) => value?.toLowerCase().includes(search.toLowerCase())));

  async function add() {
    if (busy || !selected.size) return;
    setBusy(true);
    try {
      await commands.add(group, entries.filter((e) => selected.has(e.id)));
      setSelected(new Set()); onOpenChange(false);
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
      <SheetHandle />
      <div className="p-4 pr-12"><DialogTitle className="break-words">Add entries to {group.title}</DialogTitle></div>
      <div className="px-4 pb-3"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find loaded entries" placeholder="Find an entry" className="h-11 w-full rounded-xl border bg-muted px-3 text-base" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {query.isLoading && <div className="grid place-items-center p-8"><Spinner /></div>}
        {query.error && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        {!query.isLoading && !query.error && !filtered.length && <p className="p-4 text-sm text-muted-foreground">{query.hasNextPage ? "No matches in the loaded entries. Load more below." : "No other entries found. You can also save a new note directly in the group."}</p>}
        {filtered.map((entry) => <button key={entry.id} type="button" role="checkbox" aria-checked={selected.has(entry.id)} onClick={() => setSelected((prev) => { const next = new Set(prev); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl p-3 text-left hover:bg-accent">
          <span className="min-w-0 flex-1 truncate text-sm">{entry.title || entry.body || entry.url || "Attachment"}</span>
          <span className="grid size-6 shrink-0 place-items-center rounded-md border">{selected.has(entry.id) && <Check className="size-4 text-primary" />}</span>
        </button>)}
        {query.hasNextPage && <Button variant="ghost" className="my-2 w-full" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more entries</Button>}
      </div>
      <div className="border-t p-4"><Button className="w-full" disabled={busy || !selected.size} onClick={() => void add()}>Add {selected.size || "selected"} {selected.size === 1 ? "entry" : "entries"}</Button></div>
    </DialogContent>
  </Dialog>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, SheetHandle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ReminderFields, defaultDraft, draftFromDate, draftToIso, type ReminderDraft } from "@/components/pickers/reminder-fields";
import { useReminderMutations } from "@/lib/data/reminders";
import { useEntry, summarize } from "@/lib/data/entries";
import { useSearch } from "@/lib/data/search";
import { useUser } from "@/lib/user-context";
import { errorMessage } from "@/lib/utils";
import type { ReminderPrefill } from "@/components/shell/stash-context";
import type { Reminder } from "@/lib/types";

export function ReminderDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill: ReminderPrefill | null;
}) {
  const user = useUser();
  const { create, update, removeWithUndo } = useReminderMutations(user.id);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<ReminderDraft>(defaultDraft());
  const [entryId, setEntryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const { data: linked } = useEntry(entryId);
  const editing = !!prefill?.id;

  useEffect(() => {
    if (!open) return;
    setTitle(prefill?.title ?? "");
    setNotes(prefill?.notes ?? "");
    setEntryId(prefill?.entryId ?? null);
    setDraft(prefill?.due_at ? draftFromDate(new Date(prefill.due_at), prefill.all_day, prefill.repeat) : defaultDraft());
    setPicking(false);
  }, [open, prefill]);

  const linkedLabel = linked ? linked.title || summarize(linked.body ?? linked.link_preview?.title ?? linked.url ?? "Entry", 60) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const finalTitle = title.trim() || linkedLabel || "";
    if (!finalTitle) {
      toast.error("Give the reminder a title");
      return;
    }
    if (!draft.date) {
      toast.error("Pick a date");
      return;
    }
    const payload = {
      title: finalTitle,
      notes: notes.trim() || null,
      due_at: draftToIso(draft),
      all_day: draft.allDay,
      repeat: draft.repeat,
      entry_id: entryId,
    };
    try {
      if (editing) await update.mutateAsync({ id: prefill!.id!, patch: { ...payload, completed_at: null } });
      else await create.mutateAsync(payload);
      toast.success(editing ? "Reminder updated" : "Reminder set");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <SheetHandle />
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit reminder" : "New reminder"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-2">
            <div className="space-y-1.5">
              <Label htmlFor="rem-title">Title</Label>
              <Input
                id="rem-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={linkedLabel ?? "e.g. Recreate this lighting setup"}
                maxLength={300}
                autoFocus
              />
            </div>
            <ReminderFields value={draft} onChange={setDraft} />
            <div className="space-y-1.5">
              <Label htmlFor="rem-notes">Notes</Label>
              <Textarea id="rem-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} className="min-h-16" placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Linked entry</Label>
              {entryId && linked ? (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{linkedLabel}</span>
                  <button type="button" onClick={() => setEntryId(null)} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Unlink entry">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : picking ? (
                <EntryPicker onPick={(id) => { setEntryId(id); setPicking(false); }} />
              ) : (
                <button type="button" onClick={() => setPicking(true)} className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                  <Link2 className="size-4" /> Link to a saved entry
                </button>
              )}
            </div>
          </div>
          <DialogFooter className="border-t sm:border-0">
            {editing && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive"
                onClick={async () => {
                  const r = reminderFromPrefill(prefill!);
                  if (r) removeWithUndo(r);
                  onOpenChange(false);
                }}
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {editing ? "Save" : "Set reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EntryPicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  // With no query, show entries from the last month so there is something to pick from.
  const params = useMemo(
    () => ({ q, kinds: [], collection: null, tag: null, favorites: false, archived: false, range: q.trim() ? ("any" as const) : ("month" as const) }),
    [q],
  );
  const { data, isFetching } = useSearch(params);
  return (
    <div className="rounded-lg border">
      <div className="relative border-b">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your stash…"
          className="h-10 w-full bg-transparent pr-3 pl-9 text-sm outline-none"
        />
      </div>
      <ul className="max-h-48 overflow-y-auto p-1">
        {(data ?? []).slice(0, 20).map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e.id)} className="w-full truncate rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent">
              {e.title || summarize(e.body ?? e.link_preview?.title ?? e.url ?? e.attachments[0]?.file_name ?? "Entry", 70)}
            </button>
          </li>
        ))}
        {!isFetching && data?.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">Nothing found</li>}
      </ul>
    </div>
  );
}

/** Rebuilds the stored reminder from the dialog's prefill so Undo can recreate it. */
function reminderFromPrefill(p: ReminderPrefill): Reminder | null {
  if (!p.id || !p.due_at) return null;
  const now = new Date().toISOString();
  return {
    id: p.id,
    user_id: "",
    entry_id: p.entryId ?? null,
    title: p.title ?? "Reminder",
    notes: p.notes ?? null,
    due_at: p.due_at,
    all_day: p.all_day ?? false,
    repeat: p.repeat ?? "none",
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

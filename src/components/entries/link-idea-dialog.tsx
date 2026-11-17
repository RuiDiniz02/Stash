"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, SheetHandle } from "@/components/ui/dialog";
import { ErrorState, Spinner } from "@/components/ui/misc";
import { ideaLabel, setIdeaLink, useLinkCandidates, useLinkedIdeas } from "@/lib/data/entry-links";
import { useUser } from "@/lib/user-context";
import { errorMessage } from "@/lib/utils";

export function LinkIdeaDialog({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { id: userId } = useUser();
  const qc = useQueryClient();
  const candidates = useLinkCandidates(entryId, search);
  const links = useLinkedIdeas(entryId);
  const linked = new Set(links.data?.map((entry) => entry.id));

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);

  async function add(otherId: string) {
    if (busy) return;
    setBusy(otherId);
    try {
      await setIdeaLink(userId, entryId, otherId, true);
      void qc.invalidateQueries({ queryKey: ["entry-links", userId] });
      toast.success("Ideas linked");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't link ideas"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent aria-describedby={undefined}>
        <SheetHandle />
        <DialogTitle className="px-4 pt-4 pb-3 pr-12">Link another idea</DialogTitle>
        <div className="px-4 pb-3">
          <input type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Find an idea…" aria-label="Find an idea" maxLength={160} className="h-11 w-full rounded-xl border bg-muted px-3 text-base" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {candidates.isLoading && <div className="grid place-items-center p-6"><Spinner /></div>}
          {candidates.error && <ErrorState error={candidates.error} onRetry={() => candidates.refetch()} />}
          {candidates.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">{search ? "No ideas match your search." : "Save another idea before making a link."}</p>}
          {candidates.data?.map((idea) => (
            <button key={idea.id} type="button" disabled={!!busy || linked.has(idea.id)} onClick={() => void add(idea.id)} className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl px-3 text-left hover:bg-accent disabled:opacity-60">
              <span className="min-w-0 flex-1 truncate text-sm">{ideaLabel(idea)}</span>
              {busy === idea.id ? <Spinner /> : linked.has(idea.id) ? <Check aria-label="Already linked" className="size-4" /> : <Link2 aria-hidden className="size-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

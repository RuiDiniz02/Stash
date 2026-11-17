"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { ideaLabel, setIdeaLink, useLinkedIdeas } from "@/lib/data/entry-links";
import { useUser } from "@/lib/user-context";
import { errorMessage } from "@/lib/utils";
import { LinkIdeaDialog } from "./link-idea-dialog";

export function RelatedIdeas({ entryId, onOpen }: { entryId: string; onOpen: (id: string) => void }) {
  const { id: userId } = useUser();
  const qc = useQueryClient();
  const { data, error, refetch } = useLinkedIdeas(entryId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(id: string) {
    if (removing) return;
    setRemoving(id);
    try {
      await setIdeaLink(userId, entryId, id, false);
      await qc.invalidateQueries({ queryKey: ["entry-links", userId] });
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't remove link"));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section aria-label="Related ideas" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Related ideas</h3>
        <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <Link2 className="size-4" /> Link an idea
        </button>
      </div>
      {error && <p className="text-xs text-muted-foreground">Couldn't load links. <button className="underline" onClick={() => void refetch()}>Retry</button></p>}
      {!!data?.length && <ul className="divide-y overflow-hidden rounded-xl border">
        {data.map((idea) => (
          <li key={idea.id} className="flex min-w-0 items-center gap-1 px-1">
            <button type="button" onClick={() => onOpen(idea.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent">
              <ArrowUpRight className="size-4 shrink-0 text-primary" /><span className="truncate">{ideaLabel(idea)}</span>
            </button>
            <button type="button" disabled={!!removing} onClick={() => void remove(idea.id)} aria-label={`Unlink ${ideaLabel(idea)}`} title="Remove link" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-40">
              <Unlink className="size-4" />
            </button>
          </li>
        ))}
      </ul>}
      {adding && <LinkIdeaDialog entryId={entryId} onClose={() => setAdding(false)} />}
    </section>
  );
}

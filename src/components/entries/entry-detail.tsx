"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, isPast } from "date-fns";
import { Bell, Check, Link2, Paperclip, Pin, Plus, RefreshCw, Repeat, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { TagInput } from "@/components/pickers/tag-input";
import { CollectionPicker } from "@/components/pickers/collection-picker";
import { Lightbox } from "@/components/media/lightbox";
import {
  addAttachments,
  deleteAttachment,
  deriveKind,
  refreshLinkPreview,
  setEntryCollections,
  setEntryTags,
  useEntry,
  useUpdateEntry,
} from "@/lib/data/entries";
import { invalidateData } from "@/lib/data/keys";
import { REPEAT_LABELS, useReminderMutations } from "@/lib/data/reminders";
import { useUser } from "@/lib/user-context";
import type { Attachment, Entry } from "@/lib/types";
import { cn, errorMessage, extractUrl, formatBytes } from "@/lib/utils";
import { useStash } from "@/components/shell/stash-context";
import { AttachmentAudio, AttachmentFile, AttachmentImage, AttachmentVideoThumb } from "./media";
import { LinkCard, detectProvider } from "./link-card";
import { EntryActions } from "./entry-actions";

export function EntryDetailSheet({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!entryId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent variant="right" hideClose overlayClassName="bg-black/20 backdrop-blur-0 sm:bg-black/10" aria-describedby={undefined}>
        {entryId && <EntryDetail entryId={entryId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EntryDetail({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { data: entry, isLoading, error, refetch } = useEntry(entryId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-3 pt-safe">
        <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Close">
          <X className="size-5" />
        </button>
        <DialogTitle className="flex-1 truncate px-1 text-sm font-medium text-muted-foreground">
          {entry ? format(new Date(entry.created_at), "EEEE, d MMM yyyy · HH:mm") : "Entry"}
        </DialogTitle>
        {entry && <HeaderToggles entry={entry} />}
        {entry && <EntryActions entry={entry} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isLoading && (
          <div className="space-y-3 p-5">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="aspect-video w-full" />
          </div>
        )}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}
        {!isLoading && !error && !entry && <p className="p-8 text-center text-sm text-muted-foreground">This entry no longer exists.</p>}
        {entry && <EntryEditor key={entry.id} entry={entry} />}
      </div>
    </div>
  );
}

function HeaderToggles({ entry }: { entry: Entry }) {
  const update = useUpdateEntry();
  return (
    <>
      <button
        onClick={() => update.mutate({ id: entry.id, patch: { is_pinned: !entry.is_pinned } })}
        aria-pressed={entry.is_pinned}
        aria-label={entry.is_pinned ? "Unpin" : "Pin"}
        className={cn("grid size-8 place-items-center rounded-lg hover:bg-accent", entry.is_pinned ? "text-primary" : "text-muted-foreground")}
      >
        <Pin className={cn("size-4", entry.is_pinned && "fill-current")} />
      </button>
      <button
        onClick={() => update.mutate({ id: entry.id, patch: { is_favorite: !entry.is_favorite } })}
        aria-pressed={entry.is_favorite}
        aria-label={entry.is_favorite ? "Remove favorite" : "Favorite"}
        className={cn("grid size-8 place-items-center rounded-lg hover:bg-accent", entry.is_favorite ? "text-amber-400" : "text-muted-foreground")}
      >
        <Star className={cn("size-4", entry.is_favorite && "fill-current")} />
      </button>
    </>
  );
}

function EntryEditor({ entry }: { entry: Entry }) {
  const user = useUser();
  const qc = useQueryClient();
  const update = useUpdateEntry();
  const { openReminder } = useStash();
  const reminders = useReminderMutations(user.id);
  const [title, setTitle] = useState(entry.title ?? "");
  const [body, setBody] = useState(entry.body ?? "");
  const [description, setDescription] = useState(entry.description ?? "");
  const [url, setUrl] = useState(entry.url ?? "");
  const [tags, setTags] = useState(entry.tags.map((t) => t.name));
  const [collectionIds, setCollectionIds] = useState(entry.collection_ids);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Keep local fields in sync when the entry changes on another device.
  useEffect(() => setTags(entry.tags.map((t) => t.name)), [entry.tags]);
  useEffect(() => setCollectionIds(entry.collection_ids), [entry.collection_ids]);

  const visual = entry.attachments.filter((a) => a.kind === "image" || a.kind === "video");
  const audio = entry.attachments.filter((a) => a.kind === "audio");
  const files = entry.attachments.filter((a) => a.kind === "file");
  const provider = entry.link_preview?.provider ?? detectProvider(entry.url);
  const embedId = entry.link_preview?.embed_id;

  function save(field: "title" | "body" | "description", value: string) {
    const clean = value.trim() || null;
    if (clean === (entry[field] ?? null)) return;
    update.mutate({ id: entry.id, patch: { [field]: clean } }, { onError: (e) => toast.error(errorMessage(e)) });
  }

  async function saveUrl() {
    const clean = url.trim() ? extractUrl(url.trim()) : null;
    if (url.trim() && !clean) {
      toast.error("That doesn't look like a valid http(s) link");
      setUrl(entry.url ?? "");
      return;
    }
    if (clean === entry.url) return;
    setUrl(clean ?? "");
    update.mutate(
      {
        id: entry.id,
        patch: { url: clean, link_preview: null, kind: deriveKind(clean, entry.attachments.map((a) => a.kind)) },
      },
      {
        onSuccess: () => clean && refreshLinkPreview(entry.id, clean).then(() => invalidateData(qc)),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  async function onTags(next: string[]) {
    setTags(next);
    try {
      await setEntryTags(user.id, entry.id, next);
      await invalidateData(qc);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onCollections(next: string[]) {
    setCollectionIds(next);
    try {
      await setEntryCollections(user.id, entry.id, next);
      await invalidateData(qc);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onAddFiles(list: FileList | null) {
    if (!list?.length) return;
    if (!navigator.onLine) return toast.error("You're offline");
    setUploading(true);
    try {
      const { failures } = await addAttachments(user.id, entry, Array.from(list));
      if (failures.length) toast.warning(failures.join("\n"));
      await invalidateData(qc);
    } catch (e) {
      toast.error(errorMessage(e, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  async function onRemoveAttachment(att: Attachment) {
    const ok = await confirm({ title: "Remove this file?", description: att.file_name ?? undefined, confirmLabel: "Remove", destructive: true });
    if (!ok) return;
    try {
      await deleteAttachment(att);
      const remaining = entry.attachments.filter((a) => a.id !== att.id).map((a) => a.kind);
      await update.mutateAsync({ id: entry.id, patch: { kind: deriveKind(entry.url, remaining) } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-6 p-5 pb-safe">
      <div className="space-y-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => save("title", title)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="Untitled"
          maxLength={300}
          aria-label="Title"
          className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => save("body", body)}
          placeholder="Add a note…"
          maxLength={50000}
          aria-label="Note"
          className="field-sizing-content min-h-12 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      {embedId && (provider === "youtube" || provider === "vimeo") && (
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <iframe
            src={
              provider === "youtube"
                ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(embedId)}`
                : `https://player.vimeo.com/video/${encodeURIComponent(embedId)}?dnt=1`
            }
            title={entry.link_preview?.title ?? "Video"}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            className="size-full"
          />
        </div>
      )}

      {entry.url && (
        <div className="space-y-2">
          <LinkCard url={entry.url} preview={entry.link_preview} />
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                await refreshLinkPreview(entry.id, entry.url!);
                await invalidateData(qc);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setRefreshing(false);
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Refresh preview
          </button>
        </div>
      )}

      {visual.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {visual.map((att, i) => (
            <div key={att.id} className={cn("group relative overflow-hidden rounded-xl", visual.length === 1 && "col-span-2")}>
              {att.kind === "video" ? (
                <AttachmentVideoThumb att={att} className="aspect-video w-full cursor-zoom-in" onClick={() => setLightbox(i)} />
              ) : (
                <AttachmentImage att={att} className={cn("w-full cursor-zoom-in", visual.length === 1 ? "max-h-[60vh] min-h-48" : "aspect-square")} onClick={() => setLightbox(i)} />
              )}
              <RemoveButton onClick={() => onRemoveAttachment(att)} />
            </div>
          ))}
        </div>
      )}

      {(audio.length > 0 || files.length > 0) && (
        <div className="space-y-2">
          {audio.map((a) => (
            <div key={a.id} className="group relative">
              <AttachmentAudio att={a} />
              <RemoveButton onClick={() => onRemoveAttachment(a)} />
            </div>
          ))}
          {files.map((a) => (
            <div key={a.id} className="group relative">
              <AttachmentFile att={a} />
              <RemoveButton onClick={() => onRemoveAttachment(a)} className="right-10" />
            </div>
          ))}
        </div>
      )}

      <div>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { void onAddFiles(e.target.files); e.target.value = ""; }} />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {uploading ? <Spinner /> : <Paperclip className="size-4" />}
          {uploading ? "Uploading…" : "Add photos, videos or files"}
        </button>
      </div>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => save("description", description)}
          placeholder="Why did you save this?"
          maxLength={5000}
          className="field-sizing-content min-h-10 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-primary/15"
        />
      </Field>

      <Field label="Link">
        <div className="relative">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => void saveUrl()}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="https://"
            inputMode="url"
            className="pl-9"
          />
        </div>
      </Field>

      <Field label="Tags">
        <TagInput value={tags} onChange={(t) => void onTags(t)} />
      </Field>

      <Field label="Collections">
        <CollectionPicker value={collectionIds} onChange={(ids) => void onCollections(ids)} />
      </Field>

      <Field
        label="Reminders"
        action={
          <button
            onClick={() => openReminder({ entryId: entry.id, title: entry.title ?? undefined })}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Add
          </button>
        }
      >
        {entry.reminders.length === 0 ? (
          <button
            onClick={() => openReminder({ entryId: entry.id, title: entry.title ?? undefined })}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent"
          >
            <Bell className="size-4" /> Remind me about this
          </button>
        ) : (
          <ul className="space-y-1.5">
            {entry.reminders.map((r) => {
              const overdue = !r.completed_at && isPast(new Date(r.due_at));
              return (
                <li key={r.id} className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5">
                  <button
                    onClick={() => reminders.toggleComplete.mutate(r)}
                    aria-label={r.completed_at ? "Mark as not done" : "Mark as done"}
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      r.completed_at ? "border-success bg-success text-white" : "border-muted-foreground/40 hover:border-primary",
                    )}
                  >
                    {r.completed_at && <Check className="size-3" strokeWidth={3} />}
                  </button>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      openReminder({ id: r.id, title: r.title, notes: r.notes, entryId: r.entry_id, due_at: r.due_at, all_day: r.all_day, repeat: r.repeat })
                    }
                  >
                    <span className={cn("block truncate text-sm", r.completed_at && "text-muted-foreground line-through")}>{r.title}</span>
                    <span className={cn("flex items-center gap-1 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                      {r.repeat !== "none" && <Repeat className="size-3" />}
                      {format(new Date(r.due_at), r.all_day ? "EEE d MMM" : "EEE d MMM, HH:mm")}
                      {r.repeat !== "none" && ` · ${REPEAT_LABELS[r.repeat]}`}
                      {overdue && " · overdue"}
                    </span>
                  </button>
                  <button
                    onClick={() => reminders.remove.mutate(r.id)}
                    aria-label="Delete reminder"
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Field>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        Saved {format(new Date(entry.created_at), "d MMM yyyy, HH:mm")}
        {entry.updated_at !== entry.created_at && ` · Edited ${format(new Date(entry.updated_at), "d MMM, HH:mm")}`}
        {entry.attachments.length > 0 && ` · ${formatBytes(entry.attachments.reduce((s, a) => s + Number(a.size_bytes), 0))}`}
      </p>

      <Lightbox
        items={visual.map((a) => ({ ...a, sourceUrl: entry.url, caption: entry.title }))}
        index={lightbox}
        onIndexChange={setLightbox}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function RemoveButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="Remove file"
      className={cn(
        "absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
    >
      <X className="size-3.5" />
    </button>
  );
}

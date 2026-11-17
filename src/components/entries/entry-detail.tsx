"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, isPast } from "date-fns";
import { Bell, Check, Link2, Paperclip, Pencil, Plus, RefreshCw, Repeat, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { CollectionPicker } from "@/components/pickers/collection-picker";
import { Lightbox } from "@/components/media/lightbox";
import {
  addAttachments,
  deriveKind,
  refreshLinkPreview,
  setEntryCollections,
  useEntry,
  useEntryCommands,
  useUpdateEntry,
  type EntryPatch,
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
import { RelatedIdeas } from "./related-ideas";

const noteText = "whitespace-pre-wrap wrap-anywhere text-base leading-7";

export function EntryDetailSheet({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const { openEntry } = useStash();
  const editor = useRef<{ save: () => Promise<boolean> }>(null);
  const closing = useRef(false);

  async function afterSaving(action: () => void) {
    if (closing.current) return;
    closing.current = true;
    try {
      if (await (editor.current?.save() ?? true)) action();
    } finally {
      closing.current = false;
    }
  }

  return (
    <Dialog open={!!entryId} onOpenChange={(o) => { if (!o) void afterSaving(onClose); }}>
      <DialogContent variant="right" hideClose overlayClassName="bg-black/20 backdrop-blur-0 sm:bg-black/10" aria-describedby={undefined}>
        {entryId && <EntryDetail key={entryId} entryId={entryId} editorRef={editor} onClose={() => void afterSaving(onClose)} onDiscard={onClose} onOpenRelated={(id) => void afterSaving(() => openEntry(id))} />}
      </DialogContent>
    </Dialog>
  );
}

function EntryDetail({
  entryId, editorRef, onClose, onDiscard, onOpenRelated,
}: {
  entryId: string;
  editorRef: React.RefObject<{ save: () => Promise<boolean> } | null>;
  onClose: () => void;
  onDiscard: () => void;
  onOpenRelated: (id: string) => void;
}) {
  const { data: entry, isLoading, error, refetch } = useEntry(entryId);
  const user = useUser();
  const editable = entry?.user_id === user.id;
  const [mobileEditing, setMobileEditing] = useState(false);
  const [finishing, setFinishing] = useState(false);

  async function finishEditing() {
    setFinishing(true);
    try {
      if (await editorRef.current?.save()) setMobileEditing(false);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-14 shrink-0 items-center gap-1 border-b px-3 pt-safe">
        <button onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Close">
          <X className="size-5" />
        </button>
        <DialogTitle className="flex-1 truncate px-1 text-sm font-medium text-muted-foreground">
          {entry ? format(new Date(entry.created_at), "EEEE, d MMM yyyy · HH:mm") : "Entry"}
        </DialogTitle>
        {editable && (
          <button
            type="button"
            onClick={() => mobileEditing ? void finishEditing() : setMobileEditing(true)}
            disabled={finishing}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary-soft disabled:opacity-65 md:hidden"
          >
            {mobileEditing ? <Check className="size-4" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
            {mobileEditing ? "Done" : "Edit"}
          </button>
        )}
        {entry && <EntryActions entry={entry} />}
      </div>
      {entry && (
        <p id="note-save-hint" className={cn("shrink-0 border-b bg-muted/30 px-5 py-2.5 text-xs leading-normal text-muted-foreground", editable && !mobileEditing && "hidden md:block")}>
          {editable ? (
            <>
              <span className="hidden md:inline">Click outside the note to save automatically.</span>
              <span className="md:hidden">Tap Done when you’ve finished editing.</span>
            </>
          ) : "Shared note · View only"}
        </p>
      )}
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
        {entry && <EntryEditor key={entry.id} entry={entry} readOnly={!editable} mobileEditing={mobileEditing} ref={editorRef} onDiscard={onDiscard} onOpenRelated={onOpenRelated} />}
      </div>
    </div>
  );
}

function EntryEditor({
  entry, readOnly, mobileEditing, ref, onDiscard, onOpenRelated,
}: {
  entry: Entry;
  readOnly: boolean;
  mobileEditing: boolean;
  ref: Ref<{ save: () => Promise<boolean> }>;
  onDiscard: () => void;
  onOpenRelated: (id: string) => void;
}) {
  const user = useUser();
  const qc = useQueryClient();
  const update = useUpdateEntry();
  const { openReminder } = useStash();
  const reminders = useReminderMutations(user.id);
  const commands = useEntryCommands();
  const [title, setTitle] = useState(entry.title ?? "");
  const [body, setBody] = useState(entry.body ?? "");
  const [url, setUrl] = useState(entry.url ?? "");
  const [collectionIds, setCollectionIds] = useState(entry.collection_ids);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const savedFields = useRef({ title: entry.title, body: entry.body, url: entry.url });
  const draft = useRef({ title, body, url });
  const saving = useRef<Promise<boolean> | null>(null);
  const acceptQueuedEdits = useRef(false);

  useImperativeHandle(ref, () => ({ save: flushEdits }));

  // Keep local fields in sync when the entry changes on another device.
  useEffect(() => setCollectionIds(entry.collection_ids), [entry.collection_ids]);

  const visual = entry.attachments.filter((a) => a.kind === "image" || a.kind === "video");
  const audio = entry.attachments.filter((a) => a.kind === "audio");
  const files = entry.attachments.filter((a) => a.kind === "file");
  const provider = entry.link_preview?.provider ?? detectProvider(entry.url);
  const embedId = entry.link_preview?.embed_id;

  if (readOnly) {
    return (
      <div className="space-y-5 p-5 pb-safe">
        <div className="space-y-2">
          {entry.title && <h2 className="text-xl font-semibold tracking-tight">{entry.title}</h2>}
          {entry.body && <p className={noteText}>{entry.body}</p>}
        </div>
        {embedId && (provider === "youtube" || provider === "vimeo") && (
          <div className="aspect-video overflow-hidden rounded-xl bg-black">
            <iframe
              src={provider === "youtube" ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(embedId)}` : `https://player.vimeo.com/video/${encodeURIComponent(embedId)}?dnt=1`}
              title={entry.link_preview?.title ?? "Video"}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              className="size-full"
            />
          </div>
        )}
        {entry.url && <LinkCard url={entry.url} preview={entry.link_preview} />}
        {visual.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {visual.map((att, index) => (
              <div key={att.id} className={cn("overflow-hidden rounded-xl", visual.length === 1 && "col-span-2")}>
                {att.kind === "video" ? (
                  <AttachmentVideoThumb att={att} className="aspect-video w-full cursor-zoom-in" onClick={() => setLightbox(index)} />
                ) : (
                  <AttachmentImage att={att} className={cn("w-full cursor-zoom-in", visual.length === 1 ? "max-h-[60vh] min-h-48" : "aspect-square")} onClick={() => setLightbox(index)} />
                )}
              </div>
            ))}
          </div>
        )}
        {audio.map((attachment) => <AttachmentAudio key={attachment.id} att={attachment} />)}
        {files.map((attachment) => <AttachmentFile key={attachment.id} att={attachment} />)}
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Shared entry · Saved {format(new Date(entry.created_at), "d MMM yyyy, HH:mm")}
        </p>
        <Lightbox
          items={visual.map((attachment) => ({ ...attachment, sourceUrl: entry.url, caption: entry.title }))}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      </div>
    );
  }

  function edit(field: "title" | "body" | "url", value: string) {
    draft.current[field] = value;
    if (field === "title") setTitle(value);
    if (field === "body") setBody(value);
    if (field === "url") setUrl(value);
    if (!saving.current) setSaveStatus("idle");
  }

  async function flushEdits(): Promise<boolean> {
    if (readOnly) return true;
    if (saving.current) {
      acceptQueuedEdits.current = true;
      return saving.current;
    }

    async function saveChanges() {
      do {
        acceptQueuedEdits.current = false;
        const current = draft.current;
        const nextUrl = current.url.trim() ? extractUrl(current.url.trim()) : null;
        const next = { title: current.title.trim() || null, body: current.body || null, url: nextUrl };
        if (current.url.trim() && !nextUrl) {
          setSaveError("Enter a valid http(s) link or clear the link field.");
          setSaveStatus("error");
          return false;
        }

        const patch: EntryPatch = {};
        if (next.title !== savedFields.current.title) patch.title = next.title;
        if (next.body !== savedFields.current.body) patch.body = next.body;
        if (next.url !== savedFields.current.url) {
          patch.url = next.url;
          patch.link_preview = null;
          patch.kind = deriveKind(next.url, entry.attachments.map((attachment) => attachment.kind));
        }
        if (!Object.keys(patch).length) return true;

        setSaveStatus("saving");
        try {
          if (!navigator.onLine) throw new Error("You're offline. Reconnect and try again.");
          await update.mutateAsync({ id: entry.id, patch });
          savedFields.current = next;
          if (patch.url) {
            void refreshLinkPreview(entry.id, patch.url).then(() => invalidateData(qc)).catch(() => undefined);
          }
          setSaveStatus("saved");
        } catch (error) {
          setSaveError(errorMessage(error, "Couldn't save your changes"));
          setSaveStatus("error");
          return false;
        }
      } while (acceptQueuedEdits.current);
      return true;
    }

    const operation = saveChanges();
    saving.current = operation;
    try {
      return await operation;
    } finally {
      saving.current = null;
    }
  }

  function saveOnDesktopBlur() {
    if (window.matchMedia("(min-width: 768px)").matches) void flushEdits();
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

  function onRemoveAttachment(att: Attachment) {
    commands.removeAttachment(entry, att);
  }

  return (
    <div className="space-y-6 p-5 pb-safe">
      {!mobileEditing && (title || body) && (
        <div className="space-y-2 md:hidden">
          {title && <h2 className="wrap-anywhere text-xl font-semibold tracking-tight">{title}</h2>}
          {body && <p className={noteText}>{body}</p>}
        </div>
      )}
      <div className={cn("space-y-1", !mobileEditing && "hidden md:block")}>
        <input
          value={title}
          onChange={(e) => edit("title", e.target.value)}
          onBlur={saveOnDesktopBlur}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur(); }}
          placeholder="Untitled"
          maxLength={300}
          aria-label="Title"
          aria-describedby="note-save-hint"
          className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
        <div className={cn("grid min-h-14 min-w-0", noteText)}>
          <div aria-hidden className="invisible col-start-1 row-start-1 min-w-0">{body}{"\n "}</div>
          <textarea
            value={body}
            onChange={(e) => edit("body", e.target.value)}
            onBlur={saveOnDesktopBlur}
            placeholder="Add a note…"
            maxLength={50000}
            rows={1}
            aria-label="Note"
            aria-describedby="note-save-hint"
            className="col-start-1 row-start-1 h-full min-h-0 w-full min-w-0 resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {saveStatus === "saving" ? "Saving changes…" : saveStatus === "saved" ? (
            <><Check className="size-3.5 animate-pop text-success" aria-hidden /> Changes saved</>
          ) : saveStatus === "error" ? "Changes still unsaved" : null}
        </p>
        {saveStatus === "error" && (
          <div className="space-y-2 rounded-lg border border-destructive/30 px-3 py-2 text-xs">
            <p className="text-destructive" role="alert">{saveError}</p>
            <div className="flex flex-wrap gap-4">
              <button className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => void flushEdits()}>Retry save</button>
              <button className="text-muted-foreground underline-offset-2 hover:underline" onClick={onDiscard}>Close without saving</button>
            </div>
          </div>
        )}
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

      <Field label="Link">
        <div className="relative">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={(e) => edit("url", e.target.value)}
            onBlur={() => void flushEdits()}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur(); }}
            placeholder="https://"
            inputMode="url"
            className="pl-9"
          />
        </div>
      </Field>

      <RelatedIdeas entryId={entry.id} onOpen={onOpenRelated} />

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
                    onClick={() => reminders.removeWithUndo(r)}
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

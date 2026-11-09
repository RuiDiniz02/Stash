"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Paperclip, X } from "lucide-react";
import { useStash } from "@/components/shell/stash-context";
import { useUser } from "@/lib/user-context";
import { cn, uuid } from "@/lib/utils";
import { useCapture } from "./use-capture";

/** Shared capture input; drafts are isolated by account and destination. */
export function QuickComposer({ collectionId, groupId, docked = false }: { collectionId?: string; groupId?: string; docked?: boolean }) {
  const { openCapture, openEntry } = useStash();
  const user = useUser();
  const save = useCapture();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const submitting = useRef(false);
  const captureId = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const draftKey = `stash-draft-v1:${user.id}:${groupId ? `group:${groupId}` : collectionId ? `collection:${collectionId}` : "inbox"}`;
  const collectionIds = collectionId ? [collectionId] : undefined;

  useEffect(() => {
    captureId.current = uuid();
    setText("");
    setTitle("");
    try {
      const raw = localStorage.getItem(draftKey) ?? "";
      try {
        const draft = JSON.parse(raw);
        if (typeof draft.text === "string" && typeof draft.id === "string") {
          setText(draft.text);
          setTitle(typeof draft.title === "string" ? draft.title : "");
          captureId.current = draft.id;
        }
        else setText(raw);
      } catch { setText(raw); }
    } catch { /* Storage may be unavailable. */ }
    setReady(true);
  }, [draftKey]);

  useEffect(() => {
    if (!docked || !dock.current) return;
    const node = dock.current;
    const update = () => document.documentElement.style.setProperty("--capture-height", `${node.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(node); update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--capture-height"); };
  }, [docked]);

  function updateDraft(value: string, nextTitle: string) {
    setText(value);
    setTitle(nextTitle);
    try {
      if (value || nextTitle) localStorage.setItem(draftKey, JSON.stringify({ id: captureId.current, text: value, title: nextTitle }));
      else localStorage.removeItem(draftKey);
    } catch { /* Capturing still works without persistent storage. */ }
  }

  const hasContent = !!(title.trim() || text.trim() || files.length);

  async function submit() {
    if (!ready || submitting.current || !hasContent) return;
    submitting.current = true;
    setSaving(true);
    try {
      const ok = await save({ id: captureId.current, title: title.trim(), text: text.trim(), files, collectionIds, groupId }, { onOpen: openEntry });
      if (ok) { updateDraft("", ""); setFiles([]); captureId.current = uuid(); }
    } finally { submitting.current = false; setSaving(false); }
  }

  return (
    <div ref={dock} className={docked ? "capture-dock" : "min-w-0"}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mx-auto w-full min-w-0 max-w-2xl rounded-2xl border bg-card p-1.5 shadow-soft transition-[border-color,box-shadow] focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
        <input
          aria-label="Note title (optional)"
          placeholder="Title (optional)"
          value={title}
          maxLength={300}
          disabled={saving || !ready}
          onChange={(event) => updateDraft(text, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              bodyInput.current?.focus();
            }
          }}
          className="h-10 w-full border-b bg-transparent px-3 text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
        />
        {!!files.length && (
          <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto p-2" aria-label="Attachments to save">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex max-w-full items-center gap-1 rounded-lg bg-muted py-1 pr-1 pl-2 text-xs">
                <span className="min-w-0 truncate">{file.name}</span>
                <button type="button" disabled={saving} onClick={() => setFiles((prev) => prev.filter((_, index) => index !== i))} aria-label={`Remove ${file.name}`} className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent"><X className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex min-w-0 items-end gap-1">
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => {
            setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]); e.target.value = "";
          }} />
          <button type="button" disabled={saving} onClick={() => fileInput.current?.click()} aria-label="Attach photos, videos or files" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"><Paperclip className="size-5" /></button>
          <div className="relative min-w-0 flex-1">
            {ready && !text && (
              <span aria-hidden className="pointer-events-none absolute inset-x-1 top-3 truncate text-[16px] leading-5 text-muted-foreground/60 sm:hidden">
                {groupId ? "Add to idea…" : "Save a thought…"}
              </span>
            )}
            <textarea
              ref={bodyInput}
              value={text} disabled={saving || !ready} onChange={(e) => updateDraft(e.target.value, title)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia("(pointer: fine)").matches)) {
                  e.preventDefault(); void submit();
                }
              }}
              onPaste={(e) => {
                if (e.clipboardData.files.length) { e.preventDefault(); setFiles((prev) => [...prev, ...Array.from(e.clipboardData.files)]); }
              }}
              rows={1} maxLength={50000} placeholder={groupId ? "Add to this idea…" : "Save a thought, link or file…"} aria-label="Quick capture"
              className="field-sizing-content max-h-40 min-h-11 w-full min-w-0 resize-none bg-transparent px-1 py-3 text-[16px] leading-5 outline-none placeholder:text-transparent disabled:opacity-70 sm:placeholder:text-muted-foreground/60"
            />
          </div>
          {!text.trim() && !files.length && (
            <button type="button" onClick={() => openCapture({ voice: true, title, collectionIds, groupId })} aria-label="Record a voice note" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent"><Mic className="size-[18px]" /></button>
          )}
          <button type="submit" disabled={saving || !ready || !hasContent} aria-label={saving ? "Saving" : "Save"} aria-busy={saving} className={cn("grid size-11 shrink-0 place-items-center rounded-xl transition active:scale-95 disabled:opacity-40", hasContent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><ArrowUp className="size-5" strokeWidth={2.4} /></button>
        </div>
        {!!files.length && <p className="px-3 pb-1 text-[11px] text-muted-foreground">Files stay on this device until you save. Text drafts are saved automatically.</p>}
      </form>
    </div>
  );
}

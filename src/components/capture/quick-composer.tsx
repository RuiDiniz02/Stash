"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, LoaderCircle, Mic, Plus, Type, Users, X } from "lucide-react";
import { useStash } from "@/components/shell/stash-context";
import { canEditCollection } from "@/lib/data/collections";
import type { Collection } from "@/lib/types";
import { useUser } from "@/lib/user-context";
import { cn, uuid } from "@/lib/utils";
import { useCapture } from "./use-capture";
import { CaptureDestinations, isSharedDestination } from "./capture-destinations";

const toolClass = "grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40";

function readDraft(key: string, fallbackDestination?: string) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data?.text === "string" && typeof data.id === "string") {
      return {
        id: data.id as string,
        text: data.text as string,
        title: typeof data.title === "string" ? data.title as string : "",
        destination: typeof data.destination === "string" ? data.destination as string : data.destination === null ? undefined : fallbackDestination,
      };
    }
  } catch { /* Older drafts stored plain text. */ }
  return { id: uuid(), text: raw, title: "", destination: fallbackDestination };
}

/** Inbox capture, including drafts left in older collection and group composers. */
export function QuickComposer({ collections }: { collections?: Collection[] }) {
  const { openCapture, openEntry } = useStash();
  const user = useUser();
  const save = useCapture();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [showTitle, setShowTitle] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [destination, setDestination] = useState<string>();
  const [ready, setReady] = useState(false);
  const submitting = useRef(false);
  const captureId = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const draftPrefix = `stash-draft-v1:${user.id}:`;
  const inboxKey = `${draftPrefix}inbox`;
  const draftKey = useRef(inboxKey);
  const destinations = collections?.filter(canEditCollection) ?? [];
  const selectedCollection = destinations.find((item) => item.id === destination);
  const selectedDestination = collections ? selectedCollection?.id : destination;
  const collectionIds = selectedDestination ? [selectedDestination] : undefined;
  const destinationName = selectedCollection?.name ?? (destination && collections ? "Inbox" : undefined);
  const shared = selectedCollection && isSharedDestination(selectedCollection);

  const restoreDraft = useCallback(() => {
    draftKey.current = inboxKey;
    let draft = null;
    try {
      draft = readDraft(inboxKey);
      if (!draft?.text && !draft?.title) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key?.startsWith(draftPrefix)) continue;
          const scope = key.slice(draftPrefix.length);
          if (!scope.startsWith("collection:") && !scope.startsWith("group:")) continue;
          const previous = readDraft(key, scope.startsWith("collection:") ? scope.slice("collection:".length) : undefined);
          if (!previous?.text && !previous?.title) continue;
          draftKey.current = key;
          draft = previous;
          break;
        }
      }
    } catch { /* Storage may be unavailable. */ }
    captureId.current = draft?.id ?? uuid();
    setText(draft?.text ?? "");
    setTitle(draft?.title ?? "");
    setShowTitle(false);
    setDestination(draft?.destination);
    setReady(true);
  }, [draftPrefix, inboxKey]);

  useEffect(restoreDraft, [restoreDraft]);

  useEffect(() => {
    if (showTitle) titleInput.current?.focus();
  }, [showTitle]);

  useEffect(() => {
    if (!saved) return;
    const timeout = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timeout);
  }, [saved]);

  useEffect(() => {
    if (!dock.current) return;
    const node = dock.current;
    const update = () => document.documentElement.style.setProperty("--capture-height", `${node.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(node); update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--capture-height"); };
  }, []);

  function updateDraft(value: string, nextTitle: string, nextDestination = selectedDestination) {
    setText(value);
    setTitle(nextTitle);
    try {
      if (value || nextTitle || nextDestination) localStorage.setItem(draftKey.current, JSON.stringify({ id: captureId.current, text: value, title: nextTitle, destination: nextDestination || null }));
      else localStorage.removeItem(draftKey.current);
    } catch { /* Capturing still works without persistent storage. */ }
  }

  const hasContent = !!(title.trim() || text.trim() || files.length);

  async function submit() {
    if (!ready || submitting.current || !hasContent) return;
    submitting.current = true;
    setSaving(true);
    setSaved(false);
    try {
      const ok = await save({ id: captureId.current, title: title.trim(), text: text.trim(), files, collectionIds }, { onOpen: openEntry });
      if (ok) {
        setFiles([]);
        try { localStorage.removeItem(draftKey.current); } catch { /* Storage may be unavailable. */ }
        restoreDraft();
        setSaved(true);
      }
    } finally { submitting.current = false; setSaving(false); }
  }

  return (
    <div ref={dock} className="capture-dock">
      <div className="mx-auto w-full min-w-0 max-w-2xl">
        {destinations.length > 0 && (
          <CaptureDestinations
            collections={destinations}
            selected={selectedDestination}
            disabled={saving || !ready}
            onSelect={(id) => { setDestination(id); updateDraft(text, title, id ?? ""); }}
          />
        )}
        <form
          onSubmit={(event) => { event.preventDefault(); void submit(); }}
          className="min-w-0 rounded-[26px] border bg-card px-2.5 py-2 shadow-soft transition-[border-color,box-shadow] focus-within:border-ring/40"
        >
          {(showTitle || title) && (
            <input
              ref={titleInput}
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
              className="h-9 w-full bg-transparent px-2.5 text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
            />
          )}
          <textarea
            ref={bodyInput}
            value={text}
            disabled={saving || !ready}
            onChange={(event) => updateDraft(event.target.value, title)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey || window.matchMedia("(pointer: fine)").matches)) {
                event.preventDefault();
                void submit();
              }
            }}
            onPaste={(event) => {
              if (event.clipboardData.files.length) {
                event.preventDefault();
                setFiles((prev) => [...prev, ...Array.from(event.clipboardData.files)]);
              }
            }}
            rows={1}
            maxLength={50000}
            placeholder="Save a thought…"
            aria-label="Quick capture"
            className="block field-sizing-content max-h-40 min-h-10 w-full min-w-0 resize-none bg-transparent px-2.5 py-2 text-[16px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-70"
          />
          {!!files.length && (
            <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto px-2 pb-1" aria-label="Attachments to save">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1 rounded-lg bg-muted py-1 pr-1 pl-2 text-xs">
                  <span className="min-w-0 truncate">{file.name}</span>
                  <button type="button" disabled={saving} onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`} className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent"><X className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex min-w-0 items-center gap-1">
            <input ref={fileInput} type="file" multiple hidden onChange={(event) => {
              setFiles((prev) => [...prev, ...Array.from(event.target.files ?? [])]);
              event.target.value = "";
            }} />
            <button type="button" disabled={saving} onClick={() => fileInput.current?.click()} aria-label="Attach photos, videos or files" title="Attach files" className={toolClass}><Plus className="size-5" /></button>
            <button
              type="button"
              disabled={saving || !ready}
              aria-label="Note title"
              aria-pressed={showTitle || !!title}
              title="Note title"
              onClick={() => {
                if (showTitle && !title) setShowTitle(false);
                else if (showTitle || title) titleInput.current?.focus();
                else setShowTitle(true);
              }}
              className={cn(toolClass, (showTitle || title) && "bg-primary-soft text-primary")}
            ><Type className="size-[17px]" /></button>
            {!text.trim() && !files.length && (
              <button type="button" disabled={saving || !ready} onClick={() => openCapture({ voice: true, title, collectionIds })} aria-label="Record a voice note" title="Record a voice note" className={toolClass}><Mic className="size-[17px]" /></button>
            )}
            <div className="min-w-0 flex-1 px-1 text-right">
              {destinationName && (
                <p aria-live="polite" className="flex min-w-0 items-center justify-end gap-1.5 text-xs text-muted-foreground" title={destinationName}>
                  {shared && <Users className="size-3.5 shrink-0" aria-label="Shared collection" />}
                  <span className="truncate">{destinationName}</span>
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={saving || !ready || !hasContent}
              aria-label={saving ? "Saving" : "Save"}
              aria-busy={saving}
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full transition active:scale-95",
                saved && !hasContent ? "bg-primary-soft text-primary" : hasContent ? "bg-primary text-primary-foreground disabled:opacity-65" : "bg-muted text-muted-foreground disabled:opacity-60",
              )}
            >
              {saving ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : saved && !hasContent
                ? <Check className="size-5 animate-pop" strokeWidth={2.4} aria-hidden />
                : <ArrowUp className="size-5" strokeWidth={2.4} aria-hidden />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

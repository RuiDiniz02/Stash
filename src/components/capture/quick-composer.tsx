"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, LoaderCircle, Mic, Plus, Type, Users, X } from "lucide-react";
import { useStash } from "@/components/shell/stash-context";
import { canEditCollection } from "@/lib/data/collections";
import type { Collection } from "@/lib/types";
import { useUser } from "@/lib/user-context";
import { cn, uuid } from "@/lib/utils";
import { useCapture } from "./use-capture";
import { CaptureDestinations, isSharedDestination } from "./capture-destinations";

const toolClass = "grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40";

/** Shared capture input; drafts are isolated by account and destination. */
export function QuickComposer({
  collectionId, groupId, docked = false, collections,
}: {
  collectionId?: string;
  groupId?: string;
  docked?: boolean;
  collections?: Collection[];
}) {
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
  const draftKey = `stash-draft-v1:${user.id}:${groupId ? `group:${groupId}` : collectionId ? `collection:${collectionId}` : "inbox"}`;
  const selectedId = collectionId ?? destination;
  const collectionIds = selectedId ? [selectedId] : undefined;
  const destinations = collections?.filter(canEditCollection) ?? [];
  const selectedCollection = destinations.find((item) => item.id === destination);
  const unavailable = !!(destination && collections && !selectedCollection);
  const destinationName = selectedCollection?.name ?? (unavailable ? "Collection unavailable" : "Collection selected");
  const shared = selectedCollection && isSharedDestination(selectedCollection);

  useEffect(() => {
    captureId.current = uuid();
    setText("");
    setTitle("");
    setShowTitle(false);
    setDestination(undefined);
    try {
      const raw = localStorage.getItem(draftKey) ?? "";
      try {
        const draft = JSON.parse(raw);
        if (typeof draft.text === "string" && typeof draft.id === "string") {
          setText(draft.text);
          setTitle(typeof draft.title === "string" ? draft.title : "");
          if (!collectionId && !groupId && typeof draft.destination === "string") setDestination(draft.destination);
          captureId.current = draft.id;
        }
        else setText(raw);
      } catch { setText(raw); }
    } catch { /* Storage may be unavailable. */ }
    setReady(true);
  }, [draftKey, collectionId, groupId]);

  useEffect(() => {
    if (showTitle) titleInput.current?.focus();
  }, [showTitle]);

  useEffect(() => {
    if (!saved) return;
    const timeout = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timeout);
  }, [saved]);

  useEffect(() => {
    if (!docked || !dock.current) return;
    const node = dock.current;
    const update = () => document.documentElement.style.setProperty("--capture-height", `${node.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(node); update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--capture-height"); };
  }, [docked]);

  function updateDraft(value: string, nextTitle: string, nextDestination = destination) {
    setText(value);
    setTitle(nextTitle);
    try {
      if (value || nextTitle || nextDestination) localStorage.setItem(draftKey, JSON.stringify({ id: captureId.current, text: value, title: nextTitle, destination: nextDestination }));
      else localStorage.removeItem(draftKey);
    } catch { /* Capturing still works without persistent storage. */ }
  }

  const hasContent = !!(title.trim() || text.trim() || files.length);

  async function submit() {
    if (!ready || submitting.current || !hasContent || unavailable) return;
    submitting.current = true;
    setSaving(true);
    setSaved(false);
    try {
      const ok = await save({ id: captureId.current, title: title.trim(), text: text.trim(), files, collectionIds, groupId }, { onOpen: openEntry });
      if (ok) {
        setText("");
        setTitle("");
        setShowTitle(false);
        setDestination(undefined);
        setFiles([]);
        try { localStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ }
        captureId.current = uuid();
        setSaved(true);
      }
    } finally { submitting.current = false; setSaving(false); }
  }

  return (
    <div ref={dock} className={docked ? "capture-dock" : "min-w-0"}>
      <div className="mx-auto w-full min-w-0 max-w-2xl">
        {(destinations.length > 0 || destination) && (
          <CaptureDestinations
            collections={destinations}
            selected={destination}
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
            placeholder={groupId ? "Add to this idea…" : "Save a thought…"}
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
              <button type="button" disabled={saving || unavailable} onClick={() => openCapture({ voice: true, title, collectionIds, groupId })} aria-label="Record a voice note" title="Record a voice note" className={toolClass}><Mic className="size-[17px]" /></button>
            )}
            <div className="min-w-0 flex-1 px-1 text-right">
              {destination && (
                <p aria-live="polite" className={cn("flex min-w-0 items-center justify-end gap-1.5 text-xs", unavailable ? "text-destructive" : "text-muted-foreground")} title={unavailable ? "Choose another destination to save" : destinationName}>
                  {shared && <Users className="size-3.5 shrink-0" aria-label="Shared collection" />}
                  <span className="truncate">{destinationName}</span>
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={saving || !ready || !hasContent || unavailable}
              aria-label={saving ? "Saving" : "Save"}
              aria-busy={saving}
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full transition active:scale-95",
                saved && !hasContent ? "bg-primary-soft text-primary" : hasContent && !unavailable ? "bg-primary text-primary-foreground disabled:opacity-65" : "bg-muted text-muted-foreground disabled:opacity-60",
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

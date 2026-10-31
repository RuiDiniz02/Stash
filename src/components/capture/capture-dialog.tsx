"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Camera, ChevronDown, Folder, Hash, ImagePlus, Link2, Mic, Paperclip, X } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogTitle, SheetHandle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { TagInput } from "@/components/pickers/tag-input";
import { CollectionPicker } from "@/components/pickers/collection-picker";
import { ReminderFields, defaultDraft, draftToIso, type ReminderDraft } from "@/components/pickers/reminder-fields";
import { FileThumb } from "./file-thumb";
import { VoiceRecorder, canRecordAudio } from "./voice-recorder";
import { useCapture } from "./use-capture";
import type { CapturePrefill } from "@/components/shell/stash-context";
import { cn, extractUrl, hostname, isMac, uuid } from "@/lib/utils";

type Section = "tags" | "collections" | "reminder" | "details";

export function CaptureDialog({
  open,
  onOpenChange,
  prefill,
  onOpenEntry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: CapturePrefill | null;
  onOpenEntry: (id: string) => void;
}) {
  const save = useCapture();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [reminder, setReminder] = useState<ReminderDraft | null>(null);
  const [sections, setSections] = useState<Set<Section>>(new Set());
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const captureId = useRef("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    captureId.current = uuid();
    setText(prefill?.text ?? "");
    setTitle(prefill?.title ?? "");
    setDescription("");
    setFiles(prefill?.files ?? []);
    setTags(prefill?.tags ?? []);
    setCollectionIds(prefill?.collectionIds ?? []);
    setReminder(null);
    setSections(new Set(prefill?.collectionIds?.length ? ["collections"] : []));
    setRecording(!!prefill?.voice && canRecordAudio());
  }, [open, prefill]);

  const url = extractUrl(text);
  const canSave = !saving && !recording && (text.trim().length > 0 || files.length > 0);
  const mod = typeof window !== "undefined" && isMac() ? "⌘" : "Ctrl";

  function toggleSection(s: Section) {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    if (s === "reminder" && !reminder) setReminder(defaultDraft());
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const arr = Array.from(list);
    if (arr.length) setFiles((f) => [...f, ...arr]);
  }

  async function submit() {
    if (!canSave || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    const input = {
      id: captureId.current,
      text,
      title,
      description,
      files,
      tags,
      collectionIds,
      groupId: prefill?.groupId,
      reminder:
        reminder && sections.has("reminder")
          ? { due_at: draftToIso(reminder), all_day: reminder.allDay, repeat: reminder.repeat }
          : null,
    };
    try {
      const ok = await save(input, { onOpen: onOpenEntry });
      if (ok) onOpenChange(false);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
      <DialogContent
        hideClose
        className="sm:top-[10vh] sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => textRef.current?.focus());
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <SheetHandle />
        <div className="flex items-center justify-between px-4 pt-3 sm:pt-4">
          <DialogTitle className="text-sm font-medium text-muted-foreground">New capture</DialogTitle>
          <button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {sections.has("details") && (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              maxLength={300}
              className="mt-2 h-auto border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              aria-label="Title"
            />
          )}
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            rows={3}
            maxLength={50000}
            placeholder="Write a note, paste a link, drop a file…"
            aria-label="Capture text"
            className="field-sizing-content mt-2 max-h-[40vh] min-h-24 w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />

          {url && (
            <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary-soft px-2 py-1 text-xs text-primary">
              <Link2 className="size-3.5 shrink-0" />
              <span className="truncate">{hostname(url)} · preview will be added after saving</span>
            </div>
          )}

          {recording && (
            <div className="mb-3">
              <VoiceRecorder
                onDone={(f) => {
                  setFiles((prev) => [...prev, f]);
                  setRecording(false);
                }}
                onCancel={() => setRecording(false)}
              />
            </div>
          )}

          {files.length > 0 && (
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
              {files.map((f, i) => (
                <FileThumb key={`${f.name}-${i}-${f.size}`} file={f} onRemove={() => setFiles((all) => all.filter((_, j) => j !== i))} />
              ))}
            </div>
          )}

          <div className="space-y-4">
            {sections.has("details") && (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                maxLength={5000}
                className="min-h-16"
                aria-label="Description"
              />
            )}
            {sections.has("tags") && <TagInput value={tags} onChange={setTags} />}
            {sections.has("collections") && <CollectionPicker value={collectionIds} onChange={setCollectionIds} />}
            {sections.has("reminder") && reminder && (
              <div className="rounded-xl border bg-muted/40 p-3">
                <ReminderFields value={reminder} onChange={setReminder} />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 border-t px-2 py-2 sm:px-3">
          <input ref={mediaInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

          <ToolButton label="Photo or video" onClick={() => mediaInput.current?.click()}>
            <ImagePlus />
          </ToolButton>
          <ToolButton label="Take photo" onClick={() => cameraInput.current?.click()} className="sm:hidden">
            <Camera />
          </ToolButton>
          <ToolButton label="Attach file" onClick={() => fileInput.current?.click()}>
            <Paperclip />
          </ToolButton>
          {canRecordAudio() && (
            <ToolButton label="Record voice note" onClick={() => setRecording(true)} active={recording}>
              <Mic />
            </ToolButton>
          )}
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolButton label="Tags" onClick={() => toggleSection("tags")} active={sections.has("tags") || tags.length > 0} count={tags.length}>
            <Hash />
          </ToolButton>
          <ToolButton
            label="Collections"
            onClick={() => toggleSection("collections")}
            active={sections.has("collections") || collectionIds.length > 0}
            count={collectionIds.length}
          >
            <Folder />
          </ToolButton>
          <ToolButton label="Reminder" onClick={() => toggleSection("reminder")} active={sections.has("reminder")}>
            <Bell />
          </ToolButton>
          <ToolButton label="Title and description" onClick={() => toggleSection("details")} active={sections.has("details")}>
            <ChevronDown className={cn("transition-transform", sections.has("details") && "rotate-180")} />
          </ToolButton>

          <div className="ml-auto flex items-center gap-2">
            {sections.has("reminder") && reminder && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {format(new Date(draftToIso(reminder)), reminder.allDay ? "EEE d MMM" : "EEE d MMM, HH:mm")}
              </span>
            )}
            <Button onClick={() => void submit()} disabled={!canSave} className="gap-2">
              Save
              <Kbd className="hidden border-white/20 bg-white/15 text-primary-foreground sm:inline-flex">{mod}↵</Kbd>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolButton({
  label,
  onClick,
  children,
  active,
  count,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  count?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "relative grid size-9 place-items-center rounded-lg transition-colors [&_svg]:size-[18px]",
        active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {children}
      {!!count && (
        <span className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

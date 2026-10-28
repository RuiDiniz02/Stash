"use client";

import { useRef, useState } from "react";
import { ArrowUp, ImagePlus, Mic } from "lucide-react";
import { useStash } from "@/components/shell/stash-context";
import { cn } from "@/lib/utils";
import { useCapture } from "./use-capture";
import { canRecordAudio } from "./voice-recorder";

/** Chat-style capture bar at the top of the inbox: type or paste, press Enter. */
export function QuickComposer({ collectionId }: { collectionId?: string }) {
  const { openCapture, openEntry } = useStash();
  const save = useCapture();
  const [text, setText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const collectionIds = collectionId ? [collectionId] : undefined;

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    const ok = await save({ text: value, collectionIds }, { onOpen: openEntry });
    if (!ok) setText(value);
  }

  return (
    <div className="flex items-end gap-1.5 rounded-2xl border bg-card p-1.5 shadow-soft transition-[border-color,box-shadow] focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,application/pdf,*/*"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) openCapture({ files, text, collectionIds });
          setText("");
        }}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        aria-label="Add photos, videos or files"
        className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ImagePlus className="size-[18px]" />
      </button>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.length) {
            e.preventDefault();
            openCapture({ files, text, collectionIds });
            setText("");
          }
        }}
        rows={1}
        maxLength={50000}
        placeholder="Capture a thought, paste a link…"
        aria-label="Quick capture"
        className="field-sizing-content max-h-48 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-5 outline-none placeholder:text-muted-foreground/60"
      />
      {!text.trim() && canRecordAudio() && (
        <button
          type="button"
          onClick={() => openCapture({ voice: true, collectionIds })}
          aria-label="Record a voice note"
          className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Mic className="size-[18px]" />
        </button>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!text.trim()}
        aria-label="Save"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl transition-all",
          text.trim() ? "bg-primary text-primary-foreground shadow-soft active:scale-90" : "bg-muted text-muted-foreground/50",
        )}
      >
        <ArrowUp className="size-[18px]" strokeWidth={2.4} />
      </button>
    </div>
  );
}

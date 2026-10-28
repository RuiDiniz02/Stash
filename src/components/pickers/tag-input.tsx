"use client";

import { useMemo, useRef, useState } from "react";
import { Hash, X } from "lucide-react";
import { useTags, normalizeTagName } from "@/lib/data/tags";
import { cn } from "@/lib/utils";

export function TagInput({
  value,
  onChange,
  placeholder = "Add tags…",
  className,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: allTags } = useTags();

  const suggestions = useMemo(() => {
    const q = draft.trim().replace(/^#/, "").toLowerCase();
    const taken = new Set(value.map((v) => v.toLowerCase()));
    return (allTags ?? [])
      .filter((t) => !taken.has(t.name.toLowerCase()) && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [allTags, draft, value]);

  function add(name: string) {
    const clean = normalizeTagName(name);
    if (!clean) return;
    if (!value.some((v) => v.toLowerCase() === clean.toLowerCase())) onChange([...value, clean]);
    setDraft("");
    setHighlight(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || (e.key === " " && draft.trim())) {
      if (e.key === "Enter" && !draft.trim() && !suggestions.length) return;
      e.preventDefault();
      if (draft.trim() && (e.key !== "Enter" || !suggestions[highlight] || !focused)) add(draft);
      else if (suggestions[highlight]) add(suggestions[highlight].name);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    }
  }

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className={cn("relative", className)}>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-primary/15"
      >
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-0.5 rounded-md bg-muted py-0.5 pr-1 pl-1.5 text-[13px]">
            <Hash className="size-3 text-muted-foreground" />
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== t));
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 120);
            if (draft.trim()) add(draft);
          }}
          placeholder={value.length ? "" : placeholder}
          aria-label="Add tag"
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-muted-foreground/70 sm:text-sm"
        />
      </div>
      {showSuggestions && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover p-1 shadow-float">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s.name);
                }}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm",
                  i === highlight ? "bg-accent" : "hover:bg-accent",
                )}
              >
                <Hash className="size-3.5 text-muted-foreground" />
                <span className="flex-1">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

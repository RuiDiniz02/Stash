"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Entry, EntryGroup } from "@/lib/types";

export interface Selection {
  active: boolean;
  selected: Set<string>;
  registered: Map<string, Entry>;
  /** When set, the selection is for adding entries to this existing group. */
  target: Pick<EntryGroup, "id" | "title"> | null;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean, entries?: Entry[]) => void;
  start: (id?: string, target?: Pick<EntryGroup, "id" | "title"> | null) => void;
  clear: () => void;
}

const SelectionContext = createContext<Selection | null>(null);

/** Multi-select for a list of entries. Components outside a provider simply don't offer selection. */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [registered, setRegistered] = useState<Map<string, Entry>>(new Map());
  const [target, setTarget] = useState<Selection["target"]>(null);

  const toggle = useCallback((id: string) => {
    setActive(true);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: string[], on: boolean, entries?: Entry[]) => {
    setActive(true);
    if (entries) setRegistered((previous) => new Map([...previous, ...entries.map((entry) => [entry.id, entry] as const)]));
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const start = useCallback((id?: string, t: Selection["target"] = null) => {
    setActive(true);
    setTarget(t);
    setSelected(id ? new Set([id]) : new Set());
    setRegistered(new Map());
    if (id && "vibrate" in navigator) navigator.vibrate?.(10);
  }, []);

  const clear = useCallback(() => {
    setActive(false);
    setTarget(null);
    setSelected(new Set());
    setRegistered(new Map());
  }, []);

  const value = useMemo<Selection>(
    () => ({ active, selected, registered, target, isSelected: (id) => selected.has(id), toggle, setMany, start, clear }),
    [active, selected, registered, target, toggle, setMany, start, clear],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  return useContext(SelectionContext);
}

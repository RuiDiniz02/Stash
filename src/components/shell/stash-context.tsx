"use client";

import { createContext, useContext } from "react";
import type { RepeatInterval } from "@/lib/types";

export interface CapturePrefill {
  text?: string;
  title?: string;
  files?: File[];
  collectionIds?: string[];
  tags?: string[];
  /** Open the voice recorder straight away. */
  voice?: boolean;
}

export interface ReminderPrefill {
  id?: string;
  title?: string;
  notes?: string | null;
  entryId?: string | null;
  due_at?: string;
  all_day?: boolean;
  repeat?: RepeatInterval;
}

export interface StashActions {
  openCapture: (prefill?: CapturePrefill) => void;
  openEntry: (id: string) => void;
  closeEntry: () => void;
  openReminder: (prefill?: ReminderPrefill) => void;
}

export const StashContext = createContext<StashActions | null>(null);

export function useStash() {
  const ctx = useContext(StashContext);
  if (!ctx) throw new Error("useStash must be used inside AppShell");
  return ctx;
}

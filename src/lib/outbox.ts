"use client";

import type { CaptureInput } from "@/lib/data/entries";

/**
 * Offline outbox: text/link captures made without a connection are kept in
 * localStorage and synced when the browser comes back online. Files are not
 * queued (they can be far larger than localStorage allows).
 */
const KEY = "stash-outbox-v1";
type Queued = Omit<CaptureInput, "files"> & { id: string; created_at: string; userId: string };

const listeners = new Set<() => void>();

function read(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

function write(items: Queued[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked; nothing more we can do offline.
  }
  listeners.forEach((l) => l());
}

export function enqueue(item: Queued) {
  write([...read(), item]);
}

export function getQueued(userId: string) {
  return read().filter((i) => i.userId === userId);
}

export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let flushing = false;

export async function flushOutbox(userId: string, send: (input: CaptureInput) => Promise<unknown>) {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of getQueued(userId)) {
      try {
        await send(item);
      } catch (err) {
        // Duplicate key means a previous flush already saved it.
        if (!(typeof err === "object" && err && "code" in err && (err as { code: string }).code === "23505")) break;
      }
      write(read().filter((i) => i.id !== item.id));
      sent += 1;
    }
  } finally {
    flushing = false;
  }
  return sent;
}

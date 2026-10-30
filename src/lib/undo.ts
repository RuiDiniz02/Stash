"use client";

import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

const UNDO_MS = 5000;
const pending = new Map<string, () => void>();

/**
 * Destructive action with undo: the caller has already hidden the item (optimistically);
 * `commit` runs after the undo window unless the user taps Undo, in which case `restore` runs.
 * Pending commits are flushed if the page is closed, so nothing is silently lost.
 */
export function deferWithUndo({
  message,
  commit,
  restore,
  delay = UNDO_MS,
}: {
  message: string;
  commit: () => Promise<unknown>;
  restore: () => void;
  delay?: number;
}) {
  const id = crypto.randomUUID();
  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    pending.delete(id);
    commit().catch((err) => {
      toast.error(errorMessage(err, "Couldn't finish that action"));
      restore();
    });
  };
  const timer = setTimeout(run, delay);
  pending.set(id, run);
  toast(message, {
    duration: delay,
    action: {
      label: "Undo",
      onClick: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pending.delete(id);
        restore();
      },
    },
  });
}

/** Reversible action that has already been applied: offers Undo, which runs `undo`. */
export function toastWithUndo(message: string, undo: () => unknown) {
  toast.success(message, {
    duration: UNDO_MS,
    action: { label: "Undo", onClick: () => void undo() },
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const run of [...pending.values()]) run();
  });
}

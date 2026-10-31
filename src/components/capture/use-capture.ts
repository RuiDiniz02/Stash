"use client";

import { useCallback } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { toast } from "sonner";
import { createEntry, deriveKind, entriesKey, parseCaptureText, type CaptureInput } from "@/lib/data/entries";
import { invalidateData } from "@/lib/data/keys";
import { enqueue } from "@/lib/outbox";
import { useUser } from "@/lib/user-context";
import { errorMessage, uuid } from "@/lib/utils";
import type { Entry } from "@/lib/types";

/** Saves a capture: optimistic for text, queued offline, toasts for uploads. */
export function useCapture() {
  const qc = useQueryClient();
  const user = useUser();

  return useCallback(
    async (input: CaptureInput, opts: { onOpen?: (id: string) => void } = {}) => {
      const id = input.id ?? uuid();
      const files = input.files ?? [];
      const created_at = new Date().toISOString();

      if (!navigator.onLine) {
        if (files.length) {
          toast.error("You're offline. Files can be uploaded once you're back online.");
          return false;
        }
        try {
          enqueue({ ...input, id, created_at, userId: user.id });
        } catch {
          toast.error("Couldn't save offline. Keep this draft and try again when connected.");
          return false;
        }
        toast("Saved offline", { description: "It will sync when you're back online." });
        return true;
      }

      if (!files.length) {
        const { url, body } = parseCaptureText(input.text);
        const optimistic: Entry = {
          id,
          user_id: user.id,
          kind: deriveKind(url, []),
          title: input.title?.trim() || null,
          body,
          description: input.description?.trim() || null,
          url,
          link_preview: null,
          is_pinned: false,
          is_favorite: false,
          is_archived: false,
          group_id: input.groupId ?? null,
          created_at,
          updated_at: created_at,
          attachments: [],
          collection_ids: input.collectionIds ?? [],
          tags: (input.tags ?? []).map((name) => ({ id: name, name })),
          reminders: [],
        };
        const destinations = [entriesKey({ view: "inbox" })];
        for (const collectionId of input.collectionIds ?? []) destinations.push(entriesKey({ collectionId }));
        if (input.groupId) destinations.push(entriesKey({ groupId: input.groupId }));
        await Promise.all(destinations.map((queryKey) => qc.cancelQueries({ queryKey, exact: true })));
        for (const key of destinations) {
          qc.setQueryData<InfiniteData<Entry[]>>(key, (data) =>
            data ? { ...data, pages: [[optimistic, ...(data.pages[0] ?? []).filter((entry) => entry.id !== id)], ...data.pages.slice(1).map((page) => page.filter((entry) => entry.id !== id))] } : data,
          );
        }
        try {
          await createEntry(user.id, { ...input, id });
          toast.success("Saved", {
            action: opts.onOpen ? { label: "Open", onClick: () => opts.onOpen?.(id) } : undefined,
          });
          return true;
        } catch (err) {
          for (const key of destinations) qc.setQueryData<InfiniteData<Entry[]>>(key, (data) =>
            data ? { ...data, pages: data.pages.map((page) => page.filter((entry) => entry.id !== id)) } : data,
          );
          toast.error(errorMessage(err, "Couldn't save"));
          return false;
        } finally {
          void invalidateData(qc);
        }
      }

      const label = files.length === 1 ? "Uploading 1 file…" : `Uploading ${files.length} files…`;
      const toastId = toast.loading(label);
      try {
        const { failures } = await createEntry(user.id, { ...input, id });
        if (failures.length) {
          toast.warning("Saved, but some files failed", { id: toastId, description: failures.join("\n") });
        } else {
          toast.success("Saved", {
            id: toastId,
            action: opts.onOpen ? { label: "Open", onClick: () => opts.onOpen?.(id) } : undefined,
          });
        }
        return true;
      } catch (err) {
        toast.error(errorMessage(err, "Upload failed"), { id: toastId });
        return false;
      } finally {
        void invalidateData(qc);
      }
    },
    [qc, user.id],
  );
}

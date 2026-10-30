"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { invalidateData } from "@/lib/data/keys";
import { toastWithUndo } from "@/lib/undo";
import type { Reminder, RepeatInterval } from "@/lib/types";

export type ReminderWithEntry = Reminder & {
  entry: { id: string; title: string | null; body: string | null; url: string | null; kind: string } | null;
};

export const REPEAT_LABELS: Record<RepeatInterval, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

export function stepDate(date: Date, repeat: RepeatInterval, n = 1) {
  switch (repeat) {
    case "daily":
      return addDays(date, n);
    case "weekly":
      return addWeeks(date, n);
    case "monthly":
      return addMonths(date, n);
    case "yearly":
      return addYears(date, n);
    default:
      return date;
  }
}

/** Next due date after completing the current occurrence, skipping any that are already past. */
export function nextDueAfterCompletion(r: Pick<Reminder, "due_at" | "repeat">, now = new Date()) {
  let next = stepDate(new Date(r.due_at), r.repeat);
  let guard = 0;
  while (next <= now && guard++ < 2000) next = stepDate(next, r.repeat);
  return next;
}

export interface Occurrence {
  key: string;
  reminder: ReminderWithEntry;
  at: Date;
  /** True for the stored (actionable) occurrence; false for projected future repeats. */
  current: boolean;
}

/** Expands repeating reminders into virtual occurrences inside [start, end). */
export function expandOccurrences(reminders: ReminderWithEntry[], start: Date, end: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const r of reminders) {
    const first = new Date(r.due_at);
    if (r.repeat === "none" || r.completed_at) {
      if (first >= start && first < end) out.push({ key: r.id, reminder: r, at: first, current: true });
      continue;
    }
    let at = first;
    let i = 0;
    while (at < end && i < 500) {
      if (at >= start) out.push({ key: `${r.id}:${i}`, reminder: r, at, current: i === 0 });
      i += 1;
      at = stepDate(first, r.repeat, i);
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function useReminders() {
  return useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const since = new Date(Date.now() - 120 * 864e5).toISOString();
      const { data, error } = await createClient()
        .from("reminders")
        .select("*,entry:entries(id,title,body,url,kind)")
        .or(`completed_at.is.null,completed_at.gte.${since}`)
        .order("due_at")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as ReminderWithEntry[];
    },
  });
}

export interface ReminderInput {
  title: string;
  notes?: string | null;
  due_at: string;
  all_day: boolean;
  repeat: RepeatInterval;
  entry_id?: string | null;
}

export function useReminderMutations(userId: string) {
  const qc = useQueryClient();
  const supabase = createClient();
  const done = () => invalidateData(qc, ["reminders", "entries", "entry", "search"]);

  const create = useMutation({
    mutationFn: async (input: ReminderInput) => {
      const { error } = await supabase.from("reminders").insert({ ...input, user_id: userId, title: input.title.trim() });
      if (error) throw error;
    },
    onSettled: done,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ReminderInput> & { completed_at?: string | null } }) => {
      const { error } = await supabase.from("reminders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: done,
  });

  const toggleComplete = useMutation({
    mutationFn: async (r: Reminder) => {
      if (r.completed_at) {
        const { error } = await supabase.from("reminders").update({ completed_at: null }).eq("id", r.id);
        if (error) throw error;
        return "reopened" as const;
      }
      if (r.repeat !== "none") {
        const { error } = await supabase
          .from("reminders")
          .update({ due_at: nextDueAfterCompletion(r).toISOString() })
          .eq("id", r.id);
        if (error) throw error;
        return "advanced" as const;
      }
      const { error } = await supabase.from("reminders").update({ completed_at: new Date().toISOString() }).eq("id", r.id);
      if (error) throw error;
      return "completed" as const;
    },
    onMutate: (r) => {
      qc.setQueryData<ReminderWithEntry[]>(["reminders"], (list) =>
        list?.map((x) =>
          x.id !== r.id
            ? x
            : r.completed_at
              ? { ...x, completed_at: null }
              : r.repeat !== "none"
                ? { ...x, due_at: nextDueAfterCompletion(r).toISOString() }
                : { ...x, completed_at: new Date().toISOString() },
        ),
      );
    },
    onSettled: done,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reminders").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => qc.setQueryData<ReminderWithEntry[]>(["reminders"], (list) => list?.filter((x) => x.id !== id)),
    onSettled: done,
  });

  /** Push the reminder forward (used by the "Snooze" action on notifications). */
  const snooze = useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number }) => {
      const { error } = await supabase
        .from("reminders")
        .update({ due_at: new Date(Date.now() + minutes * 60_000).toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: done,
  });

  /** Deletes at once and offers Undo, which recreates the same reminder (same id). */
  const removeWithUndo = (r: Reminder) => {
    remove.mutate(r.id, {
      onSuccess: () =>
        toastWithUndo("Reminder deleted", async () => {
          const { id, title, notes, due_at, all_day, repeat, entry_id, completed_at } = r;
          const { error } = await supabase
            .from("reminders")
            .insert({ id, user_id: userId, title, notes, due_at, all_day, repeat, entry_id, completed_at });
          if (error) toast.error(error.message);
          await done();
        }),
      onError: (e) => toast.error(e.message),
    });
  };

  return { create, update, toggleComplete, remove, removeWithUndo, snooze };
}

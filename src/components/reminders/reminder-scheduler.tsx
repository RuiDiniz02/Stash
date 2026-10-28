"use client";

import { useEffect, useRef } from "react";
import { isPast } from "date-fns";
import { toast } from "sonner";
import { useReminders, useReminderMutations, type ReminderWithEntry } from "@/lib/data/reminders";
import { useUser } from "@/lib/user-context";
import { useStash } from "@/components/shell/stash-context";

const SEEN_KEY = "stash-notified-v1";

function loadSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, number>) {
  // Keep only the last 30 days of notification keys.
  const cutoff = Date.now() - 30 * 864e5;
  const pruned = Object.fromEntries(Object.entries(seen).filter(([, t]) => t > cutoff));
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(pruned));
  } catch {
    // ignore
  }
}

async function showSystemNotification(r: ReminderWithEntry) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const body = r.notes || r.entry?.title || r.entry?.body?.slice(0, 120) || r.entry?.url || "";
  const data = { url: r.entry_id ? `/?entry=${r.entry_id}` : "/calendar" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(r.title, { body, tag: `${r.id}:${r.due_at}`, icon: "/icons/192", badge: "/icons/192", data });
      return;
    }
  } catch {
    // fall through to the page-level API
  }
  const n = new Notification(r.title, { body, tag: `${r.id}:${r.due_at}`, icon: "/icons/192" });
  n.onclick = () => {
    window.focus();
    window.location.href = data.url;
  };
}

/**
 * Fires in-app toasts and system notifications for due reminders while Stash is open
 * (foreground or background tab). Closed-app delivery needs Web Push — see README.
 */
export function ReminderScheduler() {
  const user = useUser();
  const { data: reminders } = useReminders();
  const { toggleComplete, snooze } = useReminderMutations(user.id);
  const { openEntry } = useStash();
  const announcedOverdue = useRef(false);
  const actions = useRef({ toggleComplete, snooze, openEntry });
  actions.current = { toggleComplete, snooze, openEntry };

  useEffect(() => {
    if (!reminders) return;
    const open = reminders.filter((r) => !r.completed_at);
    const seen = loadSeen();

    const fire = (r: ReminderWithEntry) => {
      const key = `${r.id}:${r.due_at}`;
      if (seen[key]) return;
      seen[key] = Date.now();
      saveSeen(seen);
      void showSystemNotification(r);
      toast(r.title, {
        description: r.entry?.title ?? r.notes ?? undefined,
        duration: 15_000,
        icon: "🔔",
        action: { label: "Done", onClick: () => actions.current.toggleComplete.mutate(r) },
        cancel: { label: "Snooze 1h", onClick: () => actions.current.snooze.mutate({ id: r.id, minutes: 60 }) },
      });
    };

    // On first load, summarise anything that became overdue while Stash was closed.
    if (!announcedOverdue.current) {
      announcedOverdue.current = true;
      const missed = open.filter((r) => isPast(new Date(r.due_at)) && !seen[`${r.id}:${r.due_at}`]);
      if (missed.length === 1) fire(missed[0]);
      else if (missed.length > 1) {
        missed.forEach((r) => (seen[`${r.id}:${r.due_at}`] = Date.now()));
        saveSeen(seen);
        toast(`${missed.length} overdue reminders`, {
          icon: "🔔",
          action: { label: "View", onClick: () => (window.location.href = "/calendar?view=agenda") },
        });
      }
    }

    // Schedule the next ones; browsers clamp long timeouts, so re-check every minute too.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const horizon = Date.now() + 60 * 60_000;
    for (const r of open) {
      const t = new Date(r.due_at).getTime();
      if (t > Date.now() && t <= horizon) timers.push(setTimeout(() => fire(r), t - Date.now()));
    }
    const interval = setInterval(() => {
      for (const r of open) {
        const t = new Date(r.due_at).getTime();
        if (t <= Date.now() && t > Date.now() - 5 * 60_000) fire(r);
      }
    }, 60_000);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [reminders]);

  return null;
}

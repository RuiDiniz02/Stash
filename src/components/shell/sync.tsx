"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createEntry } from "@/lib/data/entries";
import { invalidateData } from "@/lib/data/keys";
import { flushOutbox, getQueued, subscribeOutbox } from "@/lib/outbox";
import { useUser } from "@/lib/user-context";

const TABLES = ["entries", "attachments", "collections", "entry_collections", "tags", "entry_tags", "reminders"] as const;

/** Cross-device sync: Postgres Changes (RLS-filtered) invalidate the affected queries. */
export function RealtimeSync() {
  const qc = useQueryClient();
  const user = useUser();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void invalidateData(qc), 400);
    };

    (async () => {
      // The browser client reads its session from cookies asynchronously. Joining before the
      // user's JWT is set makes Realtime treat us as anon, and RLS then filters out every change.
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      let ch = supabase.channel(`stash-sync-${user.id}`);
      for (const table of TABLES) {
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${user.id}` }, schedule);
      }
      channel = ch.subscribe((status, err) => {
        if (process.env.NODE_ENV !== "production") console.debug("[realtime]", status, err?.message ?? "");
      });
    })();

    const onOnline = () => void invalidateData(qc);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [qc, user.id]);

  return null;
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function useQueuedCount(userId: string) {
  return useSyncExternalStore(
    subscribeOutbox,
    () => getQueued(userId).length,
    () => 0,
  );
}

/** Sends captures that were queued offline once the connection returns. */
export function OutboxSync() {
  const user = useUser();
  const qc = useQueryClient();
  const online = useOnline();

  useEffect(() => {
    if (!online) return;
    void flushOutbox(user.id, (input) => createEntry(user.id, input)).then((sent) => {
      if (sent > 0) {
        toast.success(sent === 1 ? "Offline capture synced" : `${sent} offline captures synced`);
        void invalidateData(qc);
      }
    });
  }, [online, user.id, qc]);

  return null;
}

export function OfflineBanner() {
  const online = useOnline();
  const user = useUser();
  const queued = useQueuedCount(user.id);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || (online && !queued)) return null;
  return (
    <div role="status" className="fixed top-2 left-1/2 z-50 -translate-x-1/2 pt-safe animate-fade-up">
      <div className="flex items-center gap-2 rounded-full border bg-popover px-3.5 py-1.5 text-xs font-medium shadow-float">
        <CloudOff className="size-3.5 text-warning" />
        {online ? `Syncing ${queued} capture${queued > 1 ? "s" : ""}…` : `Offline${queued ? ` · ${queued} waiting to sync` : " · captures will sync later"}`}
      </div>
    </div>
  );
}

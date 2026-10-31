"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { ReminderScheduler } from "@/components/reminders/reminder-scheduler";
import { createClient } from "@/lib/supabase/client";
import { SplashScreen } from "./splash";
import { ConfirmHost } from "@/components/ui/confirm";
import { useProfileAccent } from "@/components/settings/use-accent";
// Registers the beforeinstallprompt listener early, before Settings is opened.
import "@/hooks/use-install-prompt";
import { BottomNav, Sidebar } from "./nav";
import { OfflineBanner, OutboxSync, RealtimeSync } from "./sync";
import { StashContext, type CapturePrefill, type ReminderPrefill, type StashActions } from "./stash-context";

const COLLAPSE_KEY = "stash-sidebar-collapsed";

// Dialogs are split out of the startup bundle; each loads the first time it is needed,
// and all of them are prefetched once the browser is idle so first opens stay instant.
const loadCapture = () => import("@/components/capture/capture-dialog");
const loadDetail = () => import("@/components/entries/entry-detail");
const loadReminder = () => import("@/components/reminders/reminder-dialog");
const CaptureDialog = dynamic(() => loadCapture().then((m) => m.CaptureDialog), { ssr: false });
const EntryDetailSheet = dynamic(() => loadDetail().then((m) => m.EntryDetailSheet), { ssr: false });
const ReminderDialog = dynamic(() => loadReminder().then((m) => m.ReminderDialog), { ssr: false });

function isEditable(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  return node.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName);
}

const noopSubscribe = () => () => {};

/**
 * The signed-in app is rendered on the client only. Every view loads its data in the browser
 * (RLS-protected, shared query cache), so server HTML would only ever be a loading state —
 * and hydrating it races with queries that sibling components have already resolved.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <SplashScreen />;
  return (
    <Suspense fallback={<SplashScreen />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entry");

  const [collapsed, setCollapsed] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturePrefill, setCapturePrefill] = useState<CapturePrefill | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderPrefill, setReminderPrefill] = useState<ReminderPrefill | null>(null);
  const [dragging, setDragging] = useState(false);
  const [captureUsed, setCaptureUsed] = useState(false);
  const [reminderUsed, setReminderUsed] = useState(false);
  const dragDepth = useRef(0);
  const hasComposer = pathname === "/" || /^\/collections\/[^/]+$/.test(pathname);

  useVisualViewport();

  useProfileAccent();

  // A page served from the offline cache skips the server's auth check; confirm the session here.
  useEffect(() => {
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session && navigator.onLine) router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    const prefetch = () => void Promise.all([loadCapture(), loadDetail(), loadReminder()]).catch(() => undefined);
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(prefetch);
    else setTimeout(prefetch, 1500);
  }, []);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  }, []);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (value === null) params.delete(key);
      else params.set(key, value);
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router],
  );

  const actions = useMemo<StashActions>(
    () => ({
      openCapture: (prefill) => {
        const collectionId = pathname.match(/^\/collections\/([^/]+)$/)?.[1];
        setCapturePrefill({ ...(collectionId ? { collectionIds: [collectionId] } : {}), ...prefill });
        setCaptureUsed(true);
        setCaptureOpen(true);
      },
      openEntry: (id) => setParam("entry", id),
      closeEntry: () => setParam("entry", null),
      openReminder: (prefill) => {
        setReminderPrefill(prefill ?? null);
        setReminderUsed(true);
        setReminderOpen(true);
      },
    }),
    [setParam, pathname],
  );

  // Manifest shortcut: /?capture=1
  useEffect(() => {
    if (searchParams.get("capture") === "1") {
      actions.openCapture();
      setParam("capture", null);
    }
  }, [searchParams, actions, setParam]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/search");
        return;
      }
      if (isEditable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog]")) return;
      if (e.key === "n" || e.key === "c") {
        e.preventDefault();
        actions.openCapture();
      } else if (e.key === "/") {
        e.preventDefault();
        router.push("/search");
      } else if (e.key === "[") {
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, router, toggleSidebar]);

  // Paste anywhere (outside inputs) to capture: screenshots, links, text.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || document.querySelector("[role=dialog]")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!files.length && !text.trim()) return;
      e.preventDefault();
      actions.openCapture({ files, text });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [actions]);

  // Drag & drop files anywhere.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e) || document.querySelector("[role=dialog]")) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const onOver = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) actions.openCapture({ files });
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [actions]);

  return (
    <StashContext.Provider value={actions}>
      <div className="flex min-h-dvh w-full min-w-0" data-composer-page={hasComposer || undefined} data-sidebar-collapsed={collapsed || undefined}>
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <main id="main" className="min-w-0 flex-1 pb-28 md:pb-10" style={hasComposer ? { paddingBottom: "calc(var(--capture-height, 90px) + 5rem + env(safe-area-inset-bottom))" } : undefined}>
          {children}
        </main>
      </div>

      <BottomNav hasComposer={hasComposer} />

      {!hasComposer && <button
        onClick={() => actions.openCapture()}
        aria-label="New capture"
        title="New capture (N)"
        className="fixed right-6 bottom-6 z-40 hidden size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-float transition hover:scale-105 active:scale-95 md:grid"
      >
        <Plus className="size-6" strokeWidth={2.4} />
      </button>}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-background/70 backdrop-blur-sm animate-in fade-in-0">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary/50 bg-card px-12 py-10 shadow-float">
            <Upload className="size-8 text-primary" />
            <p className="text-sm font-medium">Drop to capture</p>
          </div>
        </div>
      )}

      {captureUsed && (
        <CaptureDialog open={captureOpen} onOpenChange={setCaptureOpen} prefill={capturePrefill} onOpenEntry={actions.openEntry} />
      )}
      {entryId && <EntryDetailSheet entryId={entryId} onClose={actions.closeEntry} />}
      {reminderUsed && <ReminderDialog open={reminderOpen} onOpenChange={setReminderOpen} prefill={reminderPrefill} />}
      <ConfirmHost />
      <RealtimeSync />
      <OutboxSync />
      <ReminderScheduler />
      <OfflineBanner />
    </StashContext.Provider>
  );
}

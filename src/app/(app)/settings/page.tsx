"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Bell, Download, HardDrive, Keyboard, LogOut, Monitor, Moon, Smartphone, Sun, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, Segmented, Skeleton, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirm } from "@/components/ui/confirm";
import { useProfile, useUpdateProfile } from "@/components/settings/use-accent";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { useStorageUsage } from "@/lib/data/media";
import { deleteAttachment } from "@/lib/data/entries";
import { deleteAccount, exportData } from "@/lib/data/account";
import { invalidateData } from "@/lib/data/keys";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/user-context";
import { ACCENTS, type Accent } from "@/lib/types";
import { cn, errorMessage, formatBytes, isIOS, isMac, isStandalone } from "@/lib/utils";

const ACCENT_HUES: Record<Accent, string> = {
  indigo: "oklch(0.55 0.19 268)",
  blue: "oklch(0.55 0.17 250)",
  teal: "oklch(0.55 0.12 190)",
  green: "oklch(0.55 0.15 150)",
  amber: "oklch(0.7 0.16 75)",
  orange: "oklch(0.62 0.19 45)",
  rose: "oklch(0.58 0.2 10)",
  violet: "oklch(0.55 0.2 300)",
  graphite: "oklch(0.35 0.015 260)",
};

const FREE_TIER_BYTES = 1024 * 1024 * 1024;

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-2xl space-y-8 px-4 pt-4 pb-10 md:px-8">
        <Appearance />
        <Notifications />
        <InstallApp />
        <Storage />
        <DataAndAccount />
        <Shortcuts />
      </div>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-3 divide-y rounded-2xl border bg-card shadow-soft">{children}</div>
    </section>
  );
}

function Row({ label, hint, children, className }: { label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-muted-foreground">{hint}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Section title="Appearance">
      <Row label="Theme">
        {mounted && (
          <Segmented
            value={(theme as "light" | "dark" | "system") ?? "system"}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
              { value: "system", label: "Auto", icon: Monitor },
            ]}
          />
        )}
      </Row>
      <Row label="Accent color" hint="Syncs across your devices.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={profile?.accent === a}
              aria-label={a}
              onClick={() => update.mutate({ accent: a }, { onError: (e) => toast.error(errorMessage(e)) })}
              style={{ background: ACCENT_HUES[a] }}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-card transition active:scale-90",
                profile?.accent === a && "ring-2 ring-foreground/70",
              )}
            />
          ))}
        </div>
      </Row>
    </Section>
  );
}

function Notifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    setIos(isIOS());
    setStandalone(isStandalone());
  }, []);

  async function enable() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: "Reminders will appear like this.", icon: "/icons/192" };
      if (reg) await reg.showNotification("Notifications are on", opts);
      else new Notification("Notifications are on", opts);
    }
  }

  return (
    <Section title="Notifications" description="Reminders alert you in the app and, with permission, as system notifications.">
      <Row
        label="Browser notifications"
        hint={
          permission === "granted"
            ? "Enabled on this device."
            : permission === "denied"
              ? "Blocked. Allow notifications for this site in your browser settings."
              : permission === "unsupported"
                ? ios && !standalone
                  ? "On iPhone and iPad, add Stash to your Home Screen first (iOS 16.4+), then enable them here."
                  : "This browser doesn't support notifications."
                : "Not enabled on this device yet."
        }
      >
        {permission === "default" && (
          <Button size="sm" onClick={() => void enable()}>
            <Bell /> Enable
          </Button>
        )}
      </Row>
      <div className="flex gap-2.5 p-4 text-[13px] text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          Notifications fire while Stash is open, even in a background tab. When the app is fully closed, browsers
          (especially iOS) won&apos;t wake it up. Reminders you missed are shown as soon as you open Stash. Alerts with
          the app closed need Web Push, which is planned for a later version.
        </p>
      </div>
    </Section>
  );
}

function InstallApp() {
  const { available, install } = useInstallPrompt();
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    setIos(isIOS());
    setStandalone(isStandalone());
  }, []);
  if (standalone) return null;

  return (
    <Section title="Install Stash">
      <Row
        label={
          <span className="flex items-center gap-2">
            <Smartphone className="size-4 text-muted-foreground" /> Add to your device
          </span>
        }
        hint={
          ios
            ? "In Safari, tap Share, then “Add to Home Screen”."
            : available
              ? "Install for a full-screen app, quick launch and the system share sheet on Android."
              : "Use your browser's “Install app” menu item. On Android, installing adds Stash to the share sheet."
        }
      >
        {available && (
          <Button size="sm" onClick={() => void install()}>
            Install
          </Button>
        )}
      </Row>
    </Section>
  );
}

function Storage() {
  const { data, isLoading } = useStorageUsage();
  const qc = useQueryClient();
  const pct = data ? Math.min(100, (data.totalBytes / FREE_TIER_BYTES) * 100) : 0;
  const kinds: { key: string; label: string }[] = [
    { key: "image", label: "Images" },
    { key: "video", label: "Videos" },
    { key: "audio", label: "Audio" },
    { key: "file", label: "Files" },
  ];

  return (
    <Section title="Storage" description="Files are stored privately in your Supabase project.">
      <div className="p-4">
        {isLoading || !data ? (
          <Skeleton className="h-12" />
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <HardDrive className="size-4 text-muted-foreground" />
                {formatBytes(data.totalBytes)} used
              </span>
              <span className="text-xs text-muted-foreground">{data.count} files · of 1 GB (Supabase free plan)</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(pct, data.totalBytes ? 1 : 0)}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {kinds.map((k) => (
                <div key={k.key} className="rounded-lg bg-muted/60 p-2">
                  <div className="text-xs text-muted-foreground">{k.label}</div>
                  <div className="text-sm font-medium tabular-nums">{formatBytes(data.byKind[k.key]?.bytes ?? 0)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {!!data?.largest.length && (
        <div className="p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Largest files</h3>
          <ul className="space-y-1">
            {data.largest.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {a.file_name ?? a.storage_path.split("/").pop()}
                  {a.entry_title && <span className="text-muted-foreground"> · {a.entry_title}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatBytes(a.size_bytes)}</span>
                <button
                  onClick={async () => {
                    const ok = await confirm({ title: "Delete this file?", description: "It will be removed from its entry.", confirmLabel: "Delete", destructive: true });
                    if (!ok) return;
                    try {
                      await deleteAttachment(a);
                      await invalidateData(qc);
                      toast.success("File deleted");
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label={`Delete ${a.file_name ?? "file"}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function DataAndAccount() {
  const user = useUser();
  const router = useRouter();
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    navigator.serviceWorker?.controller?.postMessage("clear-cache");
    qc.clear();
    router.replace("/login");
    router.refresh();
  }

  async function onExport() {
    setExporting(true);
    try {
      const { entries, files } = await exportData(user.email);
      toast.success(`Exported ${entries} entries and ${files} file links`);
    } catch (e) {
      toast.error(errorMessage(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  async function onResetPassword() {
    if (!user.email) return;
    const { error } = await createClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteAccount(user.id);
      qc.clear();
      try {
        localStorage.clear();
      } catch {
        // ignore
      }
      router.replace("/signup");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't delete account"));
      setDeleting(false);
    }
  }

  return (
    <>
      <Section title="Data & account">
        <Row label="Export your data" hint="Download everything as JSON, including links to your files (valid for 7 days).">
          <Button size="sm" variant="outline" onClick={() => void onExport()} disabled={exporting}>
            {exporting ? <Spinner /> : <Download />} Export
          </Button>
        </Row>
        <Row label="Signed in as" hint={user.email ?? "—"}>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => void onResetPassword()}>
              Change password
            </Button>
            <Button size="sm" variant="outline" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
          </div>
        </Row>
        <Row label={<span className="text-destructive">Delete account</span>} hint="Permanently deletes your account, entries, files and reminders.">
          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete
          </Button>
        </Row>
      </Section>

      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Everything in your Stash will be permanently deleted on all devices. Consider exporting your data first. Type{" "}
              <strong className="text-foreground">DELETE</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="px-5">
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoComplete="off" aria-label="Type DELETE to confirm" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={confirmText !== "DELETE" || deleting} onClick={() => void onDelete()}>
              {deleting && <Spinner className="text-white" />} Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Shortcuts() {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => setMod(isMac() ? "⌘" : "Ctrl"), []);
  const items: [string, React.ReactNode][] = [
    ["New capture", <Kbd key="n">N</Kbd>],
    ["Save capture", <span key="s" className="flex gap-1"><Kbd>{mod}</Kbd><Kbd>↵</Kbd></span>],
    ["Search", <span key="k" className="flex gap-1"><Kbd>{mod}</Kbd><Kbd>K</Kbd> or <Kbd>/</Kbd></span>],
    ["Toggle sidebar", <Kbd key="b">[</Kbd>],
    ["Paste screenshot or link anywhere", <span key="v" className="flex gap-1"><Kbd>{mod}</Kbd><Kbd>V</Kbd></span>],
    ["Close panel", <Kbd key="e">Esc</Kbd>],
  ];
  return (
    <section className="hidden md:block">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Keyboard className="size-4 text-muted-foreground" /> Keyboard shortcuts
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {items.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="flex items-center gap-1 text-xs text-muted-foreground">{keys}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

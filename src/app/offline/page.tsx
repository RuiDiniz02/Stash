import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-muted">
        <WifiOff className="size-5 text-muted-foreground" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">You&apos;re offline</h1>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        This page hasn&apos;t been saved for offline use yet. Reconnect and Stash will pick up where you left off.
      </p>
      <a href="/" className="mt-6 text-sm font-medium text-primary">Try again</a>
    </main>
  );
}

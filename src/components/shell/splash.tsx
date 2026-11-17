import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui/misc";

/**
 * Launch screen. Rendered in the server HTML, so it appears as soon as the page arrives —
 * before any JavaScript — and stays until the app shell mounts.
 */
export function SplashScreen() {
  return (
    <div
      role="status"
      aria-label="Opening Stash"
      className="min-h-dvh bg-background pt-safe"
    >
      <div className="flex h-14 items-center border-b px-4 md:px-8" aria-hidden>
        <Logo />
      </div>
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-7" aria-hidden>
        <Skeleton className="h-4 w-16" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-2.5 rounded-2xl border bg-card p-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { LogoMark } from "@/components/logo";
import { VERSION_LABEL } from "@/lib/version";

/**
 * Launch screen. Rendered in the server HTML, so it appears as soon as the page arrives —
 * before any JavaScript — and stays until the app shell mounts.
 */
export function SplashScreen() {
  return (
    <div
      role="status"
      aria-label="Opening Stash"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background pt-safe pb-safe"
    >
      <div className="flex flex-col items-center gap-4 animate-splash-in">
        <LogoMark className="size-16 rounded-[20px] shadow-float" />
        <span className="text-lg font-semibold tracking-tight">Stash</span>
        <span className="relative mt-2 h-1 w-24 overflow-hidden rounded-full bg-muted">
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary animate-splash-bar" />
        </span>
      </div>
      <span className="absolute bottom-6 text-[11px] font-medium text-muted-foreground/70 tabular-nums pb-safe">
        {VERSION_LABEL}
      </span>
    </div>
  );
}

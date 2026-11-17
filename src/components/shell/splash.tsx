import { LogoMark } from "@/components/logo";

/**
 * Launch screen. Rendered in the server HTML, so it appears as soon as the page arrives —
 * before any JavaScript — and stays until the app shell mounts.
 */
export function SplashScreen() {
  return (
    <div
      role="status"
      className="launch-screen grid min-h-dvh place-items-center overflow-hidden px-6"
    >
      <div className="grid -translate-y-6 justify-items-center gap-5 text-center">
        <div className="launch-mark grid size-28 place-items-center rounded-[36px]" aria-hidden>
          <LogoMark className="size-[76px] rounded-[25px] shadow-float" />
        </div>
        <span className="text-[30px] leading-none font-semibold tracking-[-0.055em]" aria-hidden>Stash</span>
        <span className="launch-label text-sm text-muted-foreground">Opening Stash…</span>
      </div>
    </div>
  );
}

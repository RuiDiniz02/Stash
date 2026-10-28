import { cn } from "@/lib/utils";

/** Stash mark: three stacked cards. Uses the current accent colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-7 place-items-center rounded-[9px] bg-primary text-primary-foreground", className)}>
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none" aria-hidden>
        <rect x="4" y="13" width="16" height="6" rx="2" fill="currentColor" />
        <rect x="5.5" y="8.5" width="13" height="3.5" rx="1.5" fill="currentColor" opacity="0.7" />
        <rect x="7" y="5" width="10" height="2.5" rx="1.25" fill="currentColor" opacity="0.45" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Stash</span>
    </span>
  );
}

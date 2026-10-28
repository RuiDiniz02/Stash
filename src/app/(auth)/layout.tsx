import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary-soft to-transparent"
      />
      <div className="relative w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-soft sm:p-7">{children}</div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Private by default. Only you can see what you save.</p>
      </div>
    </main>
  );
}

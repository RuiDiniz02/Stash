import { Logo } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Connect Stash to Supabase</h1>
      {isSupabaseConfigured ? (
        <p className="mt-3 text-muted-foreground">Supabase is configured. <a className="text-primary underline" href="/">Open Stash →</a></p>
      ) : (
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-muted-foreground">
          <li>Create a project at supabase.com.</li>
          <li>Run <code className="rounded bg-muted px-1">supabase/migrations/*.sql</code> in the SQL editor (or <code className="rounded bg-muted px-1">supabase db push</code>).</li>
          <li>Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code> and fill in the project URL and publishable key.</li>
          <li>Restart the dev server.</li>
        </ol>
      )}
    </main>
  );
}

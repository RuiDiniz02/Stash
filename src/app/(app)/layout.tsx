import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserProvider } from "@/lib/user-context";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  return (
    <UserProvider user={{ id: claims.sub, email: (claims.email as string | undefined) ?? null }}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}

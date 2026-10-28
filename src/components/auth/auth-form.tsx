"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/utils";

type Mode = "login" | "signup" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  login: { title: "Welcome back", subtitle: "Sign in to your Stash.", cta: "Sign in" },
  signup: { title: "Create your Stash", subtitle: "A private place for everything you save.", cta: "Create account" },
  forgot: { title: "Reset password", subtitle: "We'll email you a link to choose a new password.", cta: "Send reset link" },
  reset: { title: "Choose a new password", subtitle: "Use at least 8 characters.", cta: "Update password" },
};

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sent, setSent] = useState(false);
  const copy = COPY[mode];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if ((mode === "signup" || mode === "reset") && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const origin = window.location.origin;
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(safeNext(params.get("next")));
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback?next=/` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setSent(true);
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated");
        router.replace("/");
        router.refresh();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center animate-fade-up">
        <h1 className="text-xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground">{email}</span>.
          {mode === "signup" ? " Confirm your email to start using Stash." : " Open it to choose a new password."}
        </p>
        <Button variant="ghost" className="mt-6" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="animate-fade-up" noValidate>
      <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>

      <div className="mt-6 space-y-4">
        {mode !== "reset" && (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        )}
        {mode !== "forgot" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</Label>
              {mode === "login" && (
                <Link href="/forgot-password" className="text-[13px] text-muted-foreground hover:text-foreground">
                  Forgot?
                </Link>
              )}
            </div>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "login" ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus={mode === "reset"}
            />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
        {loading && <Spinner className="text-current" />}
        {copy.cta}
      </Button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New to Stash?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

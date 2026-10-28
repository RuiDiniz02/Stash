import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Handles email confirmation, magic links and password-reset links (PKCE code or token_hash). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let error: string | null = searchParams.get("error_description");

  if (!error && code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error?.message ?? null;
  } else if (!error && tokenHash && type) {
    const result = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    error = result.error?.message ?? null;
  } else if (!error) {
    error = "This link is invalid or has expired.";
  }

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }
  return NextResponse.redirect(`${origin}${type === "recovery" ? "/reset-password" : next}`);
}

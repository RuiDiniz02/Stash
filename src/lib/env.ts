export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";
export const STORAGE_BUCKET = "stash";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

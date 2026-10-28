import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets, PWA files and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|icons/|manifest.webmanifest|sw.js|robots.txt|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|js)$).*)",
  ],
};

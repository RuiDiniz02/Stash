import { NextResponse, type NextRequest } from "next/server";

/**
 * Fallback for the Web Share Target when the service worker isn't controlling the page yet.
 * The service worker normally intercepts this POST (and keeps shared files); here only text survives.
 */
export async function POST(request: NextRequest) {
  const params = new URLSearchParams();
  try {
    const form = await request.formData();
    for (const key of ["title", "text", "url"]) {
      const value = form.get(key);
      if (typeof value === "string" && value) params.set(key, value.slice(0, 4000));
    }
  } catch {
    // Malformed body: just open the share screen.
  }
  return NextResponse.redirect(new URL(`/share?${params}`, request.url), 303);
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(`/share?${request.nextUrl.searchParams}`, request.url), 303);
}

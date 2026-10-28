import { NextResponse, type NextRequest } from "next/server";
import { getUserId } from "@/lib/supabase/server";
import { getLinkPreview } from "@/lib/link-preview";

export const runtime = "nodejs";

/** Fetches Open Graph / oEmbed metadata server-side. Signed-in users only, so it can't be used as an open proxy. */
export async function GET(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw || raw.length > 4096) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const preview = await getLinkPreview(url.toString());
  return NextResponse.json(preview, { headers: { "Cache-Control": "private, max-age=3600" } });
}

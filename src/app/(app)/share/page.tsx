"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/misc";
import { useStash } from "@/components/shell/stash-context";
import { takeSharedPayload } from "@/lib/share-store";

function joinShared(title: string, text: string, url: string) {
  // Many apps put the URL inside `text`; avoid duplicating it.
  const parts = [text.trim()];
  if (url && !text.includes(url)) parts.push(url.trim());
  return { title: title.trim() && title.trim() !== text.trim() ? title.trim() : "", text: parts.filter(Boolean).join("\n") };
}

function ShareReceiver() {
  const router = useRouter();
  const params = useSearchParams();
  const { openCapture } = useStash();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    (async () => {
      const stored = await takeSharedPayload().catch(() => null);
      const source = stored ?? {
        title: params.get("title") ?? "",
        text: params.get("text") ?? "",
        url: params.get("url") ?? "",
        files: [] as File[],
      };
      const { title, text } = joinShared(source.title, source.text, source.url);
      router.replace("/");
      if (text || title || source.files.length) {
        setTimeout(() => openCapture({ text, title, files: source.files }), 50);
      }
    })();
  }, [params, router, openCapture]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner /> Preparing shared content…
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense>
      <ShareReceiver />
    </Suspense>
  );
}

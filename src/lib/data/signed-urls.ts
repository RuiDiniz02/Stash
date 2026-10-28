"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET } from "@/lib/env";

const TTL_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; expires: number }>();
const waiting = new Map<string, Array<(url: string | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const paths = Array.from(waiting.keys());
  const callbacks = new Map(waiting);
  waiting.clear();
  if (!paths.length) return;

  createClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrls(paths, TTL_SECONDS)
    .then(({ data, error }) => {
      const expires = Date.now() + (TTL_SECONDS - 120) * 1000;
      const byPath = new Map<string, string>();
      if (!error && data) {
        for (const item of data) {
          if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
        }
      }
      for (const path of paths) {
        const url = byPath.get(path) ?? null;
        if (url) cache.set(path, { url, expires });
        callbacks.get(path)?.forEach((cb) => cb(url));
      }
    });
}

/** Batches every signed-URL request made in the same tick into one Storage call. */
export function getSignedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    const list = waiting.get(path) ?? [];
    list.push(resolve);
    waiting.set(path, list);
    if (!timer) timer = setTimeout(flush, 16);
  });
}

export function peekSignedUrl(path: string | null | undefined) {
  if (!path) return null;
  const hit = cache.get(path);
  return hit && hit.expires > Date.now() ? hit.url : null;
}

export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => peekSignedUrl(path));

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    const cached = peekSignedUrl(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    let alive = true;
    getSignedUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);

  return url;
}

export async function downloadStorageFile(path: string, fileName: string) {
  const { data, error } = await createClient().storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) throw error ?? new Error("Download failed");
  const href = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

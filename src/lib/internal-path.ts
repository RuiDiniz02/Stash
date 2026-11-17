const BASE = "https://stash.invalid";

export function safeInternalPath(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\p{Cc}]/u.test(value)) return "/";
  try {
    const url = new URL(value, BASE);
    if (url.origin === BASE && !url.pathname.startsWith("//")) return url.pathname + url.search + url.hash;
  } catch {
    // Fall back to the Inbox for malformed redirects.
  }
  return "/";
}

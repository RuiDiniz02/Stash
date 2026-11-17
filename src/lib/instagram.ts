/** Resolve public post shapes without sending a request or trusting arbitrary embed URLs. */
export function instagramPost(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || !/^(?:(?:www|m)\.)?instagram\.com$/.test(url.hostname) || url.port || url.username || url.password) return null;

  // Shared links can require an Instagram redirect or sign-in to resolve.
  const share = url.pathname.match(/^\/share\/(reel\/|p\/)?[\w-]+\/?$/i);
  if (share) return { sourceUrl: url.href, embedUrl: null, video: share[1]?.toLowerCase() === "reel/" };

  const post = url.pathname.match(/^\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)(?:\/embed(?:\/captioned)?)?\/?$/i);
  if (post) {
    const type = post[1].toLowerCase().replace(/^reels$/, "reel");
    const sourceUrl = `https://www.instagram.com/${type}/${post[2]}/`;
    return { sourceUrl, embedUrl: `${sourceUrl}embed/`, video: type !== "p" };
  }
  return null;
}

export function instagramThumbnail(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)) return url.href;
  } catch { /* A preview image is optional. */ }
  return null;
}

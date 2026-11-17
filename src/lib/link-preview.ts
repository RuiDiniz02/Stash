import "server-only";
import type { IncomingMessage } from "node:http";
import { requestPublicUrl } from "./public-http";
import type { LinkPreview, Provider } from "@/lib/types";

const MAX_BYTES = 768 * 1024;
const TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 4;
const UA = "Mozilla/5.0 (compatible; StashBot/1.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko)";

export function detectProvider(url: URL): Provider {
  const h = url.hostname.replace(/^www\.|^m\./, "");
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(h)) return "youtube";
  if (/(^|\.)vimeo\.com$/.test(h)) return "vimeo";
  if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)(x|twitter)\.com$/.test(h)) return "x";
  if (/(^|\.)(facebook|fb)\.com$|^fb\.watch$/.test(h)) return "facebook";
  if (/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/.test(h)) return "pinterest";
  if (/(^|\.)threads\.(net|com)$/.test(h)) return "threads";
  if (/(^|\.)reddit\.com$|^redd\.it$/.test(h)) return "reddit";
  if (/(^|\.)spotify\.com$/.test(h)) return "spotify";
  return "web";
}

function youtubeId(url: URL) {
  if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (url.pathname.startsWith("/watch")) return url.searchParams.get("v");
  const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
  return m ? m[1] : null;
}

function vimeoId(url: URL) {
  const m = url.pathname.match(/\/(\d{6,})/);
  return m ? m[1] : null;
}

// --- SSRF protection -------------------------------------------------------

async function safeFetch(input: string, accept: string) {
  let url = new URL(input);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await requestPublicUrl(url, { "user-agent": UA, accept, "accept-language": "en,*;q=0.5" }, signal);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.destroy();
      url = new URL(res.headers.location, url);
      continue;
    }
    return { res, url, ok: status >= 200 && status < 300 };
  }
  throw new Error("Too many redirects");
}

async function readLimited(res: IncomingMessage, stopAtHead = false) {
  const chunks: Buffer[] = [];
  let total = 0;
  let tail = "";
  for await (const value of res) {
    const chunk = (value as Buffer).subarray(0, MAX_BYTES - total);
    chunks.push(chunk);
    total += chunk.byteLength;
    if (total >= MAX_BYTES) break;
    if (stopAtHead) {
      const text = tail + chunk.toString("utf8").toLowerCase();
      if (text.includes("</head>")) break;
      tail = text.slice(-6);
    }
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

// --- HTML parsing ----------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decode(s: string) {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function parseMeta(html: string) {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    const key = attr("property") ?? attr("name") ?? attr("itemprop");
    const content = attr("content");
    if (!key || !content) continue;
    const k = (key[2] ?? key[3] ?? key[4] ?? "").toLowerCase();
    const v = content[2] ?? content[3] ?? content[4] ?? "";
    if (k && v && !meta.has(k)) meta.set(k, decode(v));
  }
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const icon = html.match(/<link\b[^>]*rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  return { meta, title: title ? decode(title) : undefined, icon };
}

function absolutize(value: string | undefined | null, base: URL) {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function clip(s: string | undefined | null, n: number) {
  if (!s) return null;
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Generic titles returned by login walls instead of real content.
const WALL_TITLES = /^(instagram|tiktok - make your day|tiktok|facebook|log in|login|x|twitter|pinterest)$/i;

async function oembed(endpoint: string): Promise<Record<string, unknown> | null> {
  try {
    const { res, ok } = await safeFetch(endpoint, "application/json");
    if (!ok) { res.destroy(); return null; }
    return JSON.parse(await readLimited(res)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getLinkPreview(raw: string): Promise<LinkPreview> {
  const url = new URL(raw);
  const provider = detectProvider(url);
  const now = new Date().toISOString();
  const base: LinkPreview = { provider, fetched_at: now };

  // Official, public oEmbed endpoints (no API key needed).
  const endpoints: Partial<Record<Provider, string>> = {
    youtube: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(raw)}`,
    vimeo: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(raw)}`,
    tiktok: `https://www.tiktok.com/oembed?url=${encodeURIComponent(raw)}`,
    spotify: `https://open.spotify.com/oembed?url=${encodeURIComponent(raw)}`,
    reddit: `https://www.reddit.com/oembed?url=${encodeURIComponent(raw)}`,
  };
  const endpoint = endpoints[provider];
  if (endpoint) {
    const data = await oembed(endpoint);
    if (data?.title || data?.thumbnail_url) {
      return {
        ...base,
        title: clip(String(data.title ?? ""), 300),
        author: clip(data.author_name ? String(data.author_name) : null, 120),
        site_name: String(data.provider_name ?? provider),
        image: typeof data.thumbnail_url === "string" ? absolutize(data.thumbnail_url, url) : null,
        description: data.author_name ? `by ${String(data.author_name)}` : null,
        embed_id: provider === "youtube" ? youtubeId(url) : provider === "vimeo" ? vimeoId(url) : null,
      };
    }
  }

  try {
    const { res, url: finalUrl, ok } = await safeFetch(raw, "text/html,application/xhtml+xml");
    const type = res.headers["content-type"] ?? "";
    if (!ok || !type.includes("html")) res.destroy();
    if (!ok) return { ...base, failed: true };
    if (type.startsWith("image/")) return { ...base, image: finalUrl.toString(), title: finalUrl.pathname.split("/").pop() ?? null };
    if (!type.includes("html")) return { ...base, title: finalUrl.pathname.split("/").pop() || finalUrl.hostname, site_name: finalUrl.hostname };

    const html = await readLimited(res, true);
    const { meta, title, icon } = parseMeta(html);
    const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find(Boolean);
    const ogTitle = pick("og:title", "twitter:title") ?? title;

    if (provider !== "web" && (!ogTitle || WALL_TITLES.test(ogTitle))) {
      // Login wall (common for Instagram/Facebook/X): keep the link, mark the preview unavailable.
      return { ...base, site_name: pick("og:site_name") ?? null, failed: true };
    }

    return {
      ...base,
      title: clip(ogTitle, 300),
      description: clip(pick("og:description", "twitter:description", "description"), 500),
      image: absolutize(pick("og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"), finalUrl),
      site_name: clip(pick("og:site_name", "application-name") ?? finalUrl.hostname.replace(/^www\./, ""), 120),
      favicon: absolutize(icon ?? "/favicon.ico", finalUrl),
      embed_id: provider === "youtube" ? youtubeId(url) : provider === "vimeo" ? vimeoId(url) : null,
    };
  } catch {
    return { ...base, failed: true };
  }
}

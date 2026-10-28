import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

function isPrivateIPv4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIP(ip: string) {
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateIPv4(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}

async function assertPublicHost(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
  if (url.port && !["80", "443", ""].includes(url.port)) throw new Error("Port not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Host not allowed");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => isPrivateIP(a.address))) throw new Error("Host not allowed");
}

async function safeFetch(input: string, accept: string): Promise<{ res: Response; url: URL }> {
  let url = new URL(input);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept, "accept-language": "en,*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    return { res, url };
  }
  throw new Error("Too many redirects");
}

async function readLimited(res: Response) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
    // Stop once the <head> is over — that's where the metadata lives.
    if (new TextDecoder().decode(value).includes("</head>")) break;
  }
  void reader.cancel().catch(() => undefined);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

// --- HTML parsing ----------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decode(s: string) {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
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
    const { res } = await safeFetch(endpoint, "application/json");
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
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
        image: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
        description: data.author_name ? `by ${String(data.author_name)}` : null,
        embed_id: provider === "youtube" ? youtubeId(url) : provider === "vimeo" ? vimeoId(url) : null,
      };
    }
  }

  try {
    const { res, url: finalUrl } = await safeFetch(raw, "text/html,application/xhtml+xml");
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) return { ...base, failed: true };
    if (type.startsWith("image/")) return { ...base, image: finalUrl.toString(), title: finalUrl.pathname.split("/").pop() ?? null };
    if (!type.includes("html")) return { ...base, title: finalUrl.pathname.split("/").pop() || finalUrl.hostname, site_name: finalUrl.hostname };

    const html = await readLimited(res);
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

import { lookup } from "node:dns/promises";
import { request as requestHttp, type IncomingMessage } from "node:http";
import { request as requestHttps } from "node:https";
import { BlockList, isIP } from "node:net";

const restricted = new BlockList();
for (const [address, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) restricted.addSubnet(address, bits, "ipv4");
for (const [address, bits] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) restricted.addSubnet(address, bits, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !restricted.check(address, "ipv4");
  if (family === 6) return globalV6.check(address, "ipv6") && !restricted.check(address, "ipv6");
  return false;
}

async function resolvePublicHost(url: URL) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("URL not allowed");
  if (url.port) throw new Error("Non-default port not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  const candidates = family ? [{ address: host, family }] : await lookup(host, { all: true });
  if (!candidates.length || candidates.some(({ address }) => !isPublicAddress(address))) throw new Error("Host not allowed");
  return candidates.find(({ family }) => family === 4) ?? candidates[0];
}

/** Connect to a checked IP without another DNS resolution, retaining the hostname for TLS. */
export async function requestPublicUrl(url: URL, headers: Record<string, string>, signal: AbortSignal) {
  const { address, family } = await resolvePublicHost(url);
  signal.throwIfAborted();
  const request = url.protocol === "https:" ? requestHttps : requestHttp;
  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = request(url, {
      agent: false,
      signal,
      headers: { ...headers, "accept-encoding": "identity" },
      family,
      lookup: (_host, _options, callback) => callback(null, address, family),
    }, resolve);
    req.once("error", reject);
    req.end();
  });
}

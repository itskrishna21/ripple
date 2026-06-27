/**
 * SSRF guard. Every tenant-supplied URL is checked before any outbound fetch.
 * Resolves all DNS addresses and rejects if any is private / reserved.
 */
import { promises as dns } from "dns";
import * as net from "net";
import { BlockedUrlError } from "../http/errors";

export type ResolvedTarget = { url: URL; ip: string };

// Each entry: [network_as_uint32, mask_as_uint32].
// All math is done on unsigned 32-bit integers.
const BLOCKED_V4_RANGES: Array<[number, number]> = [
  [0x00000000, 0xff000000], // 0.0.0.0/8
  [0x0a000000, 0xff000000], // 10.0.0.0/8
  [0x64400000, 0xffc00000], // 100.64.0.0/10  (CGNAT)
  [0x7f000000, 0xff000000], // 127.0.0.0/8    (loopback)
  [0xa9fe0000, 0xffff0000], // 169.254.0.0/16 (link-local)
  [0xac100000, 0xfff00000], // 172.16.0.0/12  (RFC 1918)
  [0xc0000000, 0xffffff00], // 192.0.0.0/24   (IETF protocol)
  [0xc0a80000, 0xffff0000], // 192.168.0.0/16 (RFC 1918)
  [0xc6120000, 0xfffe0000], // 198.18.0.0/15  (benchmarking)
  [0xe0000000, 0xf0000000], // 224.0.0.0/4    (multicast)
  [0xf0000000, 0xf0000000], // 240.0.0.0/4    (reserved)
];

function ipv4ToUint32(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc * 256 + parseInt(octet, 10)) >>> 0, 0) >>> 0
  );
}

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  // `&` converts operands to int32 (signed); `>>> 0` converts back to uint32
  // so we compare in the same unsigned space as the constant table.
  return BLOCKED_V4_RANGES.some(
    ([network, mask]) => ((n & mask) >>> 0) === (network >>> 0),
  );
}

function isBlockedV6(ip: string): boolean {
  const l = ip.toLowerCase();
  return (
    l === "::1" || // loopback
    l.startsWith("fc") || // ULA fc00::/7
    l.startsWith("fd") || // ULA fc00::/7
    l.startsWith("fe80") || // link-local fe80::/10
    l.startsWith("::ffff:") // IPv4-mapped ::ffff:0:0/96
  );
}

function isBlockedIP(address: string): boolean {
  if (net.isIPv4(address)) return isBlockedV4(address);
  if (net.isIPv6(address)) return isBlockedV6(address);
  return true; // unknown format → safest to block
}

/**
 * Validates that `raw` is a safe, publicly-routable HTTP/HTTPS URL.
 * Resolves all DNS records and rejects if any resolved address is private.
 *
 * Throws `BlockedUrlError` on any violation (scheme, no-dns, private-ip).
 * Returns the parsed URL and the first resolved IP on success.
 */
export async function assertUrlSafe(raw: string): Promise<ResolvedTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("invalid-url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("scheme");
  }

  const results = await dns.lookup(url.hostname, { all: true });

  if (!results || results.length === 0) {
    throw new BlockedUrlError("no-dns");
  }

  for (const { address } of results) {
    if (isBlockedIP(address)) {
      throw new BlockedUrlError("private-ip");
    }
  }

  return { url, ip: results[0]!.address };
}

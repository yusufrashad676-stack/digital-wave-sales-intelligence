import { UrlSafetyError } from '../../modules/search/domain/errors/enrichment.errors.js';

const MAX_URL_LENGTH = 2048;

const DEFAULT_ALLOWED_SCHEMES = ['https'];

const RESERVED_DOMAINS = ['localhost', '*.local', '*.internal'];

// IPv4 private/loopback/link-local ranges as [first, last] tuples
const IPV4_BLOCKED_RANGES: Array<[number, number]> = [
  [0x00000000, 0x000000ff], // 0.0.0.0/8 (current network)
  [0x0a000000, 0x0affffff], // 10.0.0.0/8 (private)
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8 (loopback)
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 (link-local)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12 (private)
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16 (private)
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24 (IETF protocol assignments)
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24 (documentation)
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24 (documentation)
];

// IPv6 ranges as [full 32-char hex prefix, prefix length in bits]
const IPV6_BLOCKED_PREFIXES: Array<[string, number]> = [
  ['00000000000000000000000000000001', 128], // ::1 (loopback)
  ['00000000000000000000000000000000', 96], // ::/96 (IPv4-compatible, deprecated)
  ['00000000000000000000ffff00000000', 96], // ::ffff:0:0/96 (IPv4-mapped)
  ['fe800000000000000000000000000000', 10], // fe80::/10 (link-local)
  ['fc000000000000000000000000000000', 7], // fc00::/7 (unique local)
];

export interface UrlSafetyCheckResult {
  safe: boolean;
  reason?: string;
}

export interface UrlSafetyOptions {
  allowedSchemes?: string[];
  blockPrivateIps?: boolean;
  blockReservedDomains?: boolean;
  maxUrlLength?: number;
  dnsResolver?: (hostname: string) => Promise<string[]>;
}

const DEFAULT_DNS_RESOLVER = async (hostname: string): Promise<string[]> => {
  const { promises: dns } = await import('node:dns');
  const ipv4 = await dns.resolve4(hostname).catch(() => []);
  const ipv6 = await dns.resolve6(hostname).catch(() => []);
  return [...ipv4, ...ipv6];
};

export async function checkUrlSafety(urlString: string, options: UrlSafetyOptions = {}): Promise<UrlSafetyCheckResult> {
  const {
    allowedSchemes = DEFAULT_ALLOWED_SCHEMES,
    blockPrivateIps = true,
    blockReservedDomains = true,
    maxUrlLength = MAX_URL_LENGTH,
    dnsResolver = DEFAULT_DNS_RESOLVER,
  } = options;

  if (urlString.length > maxUrlLength) {
    return { safe: false, reason: `URL exceeds maximum length of ${maxUrlLength}` };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  if (!allowedSchemes.includes(parsed.protocol.replace(':', ''))) {
    return { safe: false, reason: `Scheme "${parsed.protocol}" is not in allowed list` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (blockReservedDomains) {
    for (const pattern of RESERVED_DOMAINS) {
      if (matchesDomainPattern(hostname, pattern)) {
        return { safe: false, reason: `Hostname "${hostname}" matches reserved domain "${pattern}"` };
      }
    }
  }

  if (blockPrivateIps) {
    const ipCheck = await checkIpSafety(hostname, dnsResolver);
    if (!ipCheck.safe) {
      return ipCheck;
    }
  }

  return { safe: true };
}

export function assertUrlSafe(urlString: string, options: UrlSafetyOptions = {}): void {
  void options;
  // Sync wrapper is intentionally not implemented.
  // Callers must use checkUrlSafety() or the async assertUrlSafety() variant.
  throw new UrlSafetyError('Use assertUrlSafety() for async URL validation');
}

export async function assertUrlSafety(urlString: string, options: UrlSafetyOptions = {}): Promise<void> {
  const result = await checkUrlSafety(urlString, options);
  if (!result.safe) {
    throw new UrlSafetyError(result.reason ?? 'URL failed safety check');
  }
}

async function checkIpSafety(
  hostname: string,
  dnsResolver: (hostname: string) => Promise<string[]>,
): Promise<UrlSafetyCheckResult> {
  let ips: string[];
  try {
    ips = await dnsResolver(hostname);
  } catch {
    // DNS resolution failure — reject to be safe
    return { safe: false, reason: `DNS resolution failed for "${hostname}"` };
  }

  if (ips.length === 0) {
    return { safe: false, reason: `DNS resolution returned no results for "${hostname}"` };
  }

  for (const ip of ips) {
    const check = checkSingleIp(ip);
    if (!check.safe) {
      return { safe: false, reason: `IP ${ip} for "${hostname}": ${check.reason}` };
    }
  }

  return { safe: true };
}

function checkSingleIp(ip: string): UrlSafetyCheckResult {
  if (ip.includes(':')) {
    return checkIpv6(ip);
  }
  return checkIpv4(ip);
}

function checkIpv4(ip: string): UrlSafetyCheckResult {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return { safe: false, reason: 'Invalid IPv4 format' };
  }

  const num = parts.reduce((acc, part) => {
    const n = Number(part);
    return acc * 256 + n;
  }, 0);

  for (const [first, last] of IPV4_BLOCKED_RANGES) {
    if (num >= first && num <= last) {
      return { safe: false, reason: `IPv4 ${ip} is in blocked range` };
    }
  }

  return { safe: true };
}

function checkIpv6(ip: string): UrlSafetyCheckResult {
  const normalized = normalizeIpv6(ip);
  if (normalized === null) {
    return { safe: false, reason: 'Invalid IPv6 format' };
  }

  const normalizedLower = normalized.toLowerCase();

  for (const [prefix, prefixLength] of IPV6_BLOCKED_PREFIXES) {
    if (ipv6MatchesPrefix(normalizedLower, prefix, prefixLength)) {
      return { safe: false, reason: `IPv6 ${ip} matches blocked prefix` };
    }
  }

  return { safe: true };
}

function ipv6MatchesPrefix(normalized: string, prefix: string, prefixLength: number): boolean {
  if (prefixLength === 0) return true;

  const fullChars = Math.floor(prefixLength / 4);
  const remainingBits = prefixLength % 4;

  // Check full hex characters
  if (normalized.slice(0, fullChars) !== prefix.slice(0, fullChars)) {
    return false;
  }

  // Check remaining bits (if any)
  if (remainingBits > 0) {
    const nextCharNormalized = parseInt(normalized[fullChars] ?? '0', 16);
    const nextCharPrefix = parseInt(prefix[fullChars] ?? '0', 16);
    const mask = 0xf << (4 - remainingBits);
    if ((nextCharNormalized & mask) !== (nextCharPrefix & mask)) {
      return false;
    }
  }

  return true;
}

function normalizeIpv6(ip: string): string | null {
  // Expand compressed IPv6 to full 32 hex chars
  // Handles :: compression and mixed notation
  const upper = ip.toUpperCase();

  // Handle mixed notation: ::ffff:192.168.1.1
  if (upper.includes('.')) {
    const lastColon = upper.lastIndexOf(':');
    const ipv4Part = upper.slice(lastColon + 1);
    const ipv4Parts = ipv4Part.split('.');
    if (ipv4Parts.length !== 4) return null;
    const hexParts = ipv4Parts.map((p) => Number(p).toString(16).padStart(2, '0'));
    const expandedIpv4 = hexParts.slice(0, 2).join('') + hexParts.slice(2).join('');
    const ipv6Prefix = upper.slice(0, lastColon);
    return expandIpv6(ipv6Prefix + ':' + expandedIpv4);
  }

  return expandIpv6(upper);
}

function expandIpv6(compressed: string): string | null {
  const groups = compressed.split('::');
  if (groups.length > 2) return null;

  let left: string[];
  let right: string[];

  if (groups.length === 2) {
    left = groups[0] ? groups[0].split(':') : [];
    right = groups[1] ? groups[1].split(':') : [];
  } else {
    left = compressed.split(':');
    right = [];
  }

  const totalGroups = left.length + right.length;
  if (totalGroups > 8) return null;

  const missing = 8 - totalGroups;
  const middle = Array(missing).fill('0000');
  const all = [...left, ...middle, ...right];

  if (all.length !== 8) return null;

  return all.map((g) => g.padStart(4, '0')).join('');
}

function matchesDomainPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // .local
    return hostname === pattern.slice(2) || hostname.endsWith(suffix);
  }
  return hostname === pattern;
}

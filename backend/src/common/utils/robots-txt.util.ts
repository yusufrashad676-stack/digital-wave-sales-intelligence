import { Logger } from '@nestjs/common';
import { safeFetch } from './safe-fetcher.util.js';
import { RobotsTxtBlockedError } from '../../modules/search/domain/errors/enrichment.errors.js';

const logger = new Logger('RobotsTxt');

const USER_AGENT_WILDCARD = '*';

export interface RobotsTxtOptions {
  timeoutMs: number;
  userAgent?: string;
  cache?: Map<string, RobotsTxtEntry>;
  fetcher?: typeof fetch;
}

export interface RobotsTxtEntry {
  allowed: boolean;
  fetchedAt: number;
}

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function checkRobotsTxt(url: string, options: RobotsTxtOptions): Promise<boolean> {
  const { timeoutMs, userAgent = 'DigitalWave', cache, fetcher } = options;

  const parsed = new URL(url);
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

  // Check cache
  const cached = cache?.get(robotsUrl);
  if (cached && Date.now() - cached.fetchedAt < DEFAULT_CACHE_TTL_MS) {
    return cached.allowed;
  }

  try {
    const result = await safeFetch(robotsUrl, {
      timeoutMs,
      userAgent,
      urlSafety: { allowedSchemes: ['https'], blockPrivateIps: false },
      fetcher,
    });

    if (!result.ok || !result.body) {
      // If robots.txt cannot be fetched, allow by default (fail open)
      cache?.set(robotsUrl, { allowed: true, fetchedAt: Date.now() });
      return true;
    }

    const allowed = parseAndCheck(result.body, parsed.pathname, userAgent);
    cache?.set(robotsUrl, { allowed, fetchedAt: Date.now() });
    return allowed;
  } catch {
    // Network error fetching robots.txt — fail open
    logger.debug(`Failed to fetch robots.txt from ${robotsUrl}, allowing by default`);
    cache?.set(robotsUrl, { allowed: true, fetchedAt: Date.now() });
    return true;
  }
}

export async function assertAllowedByRobotsTxt(url: string, options: RobotsTxtOptions): Promise<void> {
  const allowed = await checkRobotsTxt(url, options);
  if (!allowed) {
    throw new RobotsTxtBlockedError(url);
  }
}

export function parseRobotsTxt(content: string): Record<string, { allow: string[]; disallow: string[] }> {
  const lines = content.split(/\r?\n/);
  const rules: Record<string, { allow: string[]; disallow: string[] }> = {};
  let currentUserAgent: string | null = null;

  for (const rawLine of lines) {
    const commentSplit = rawLine.split('#');
    const line = (commentSplit[0] ?? '').trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'user-agent') {
      currentUserAgent = value;
      if (!rules[value]) {
        rules[value] = { allow: [], disallow: [] };
      }
    } else if (currentUserAgent && rules[currentUserAgent]) {
      const directive = key.charAt(0).toUpperCase() + key.slice(1);
      if (directive === 'Allow') {
        rules[currentUserAgent]!.allow.push(value);
      } else if (directive === 'Disallow') {
        rules[currentUserAgent]!.disallow.push(value);
      }
    }
  }

  return rules;
}

function parseAndCheck(content: string, pathname: string, userAgent: string): boolean {
  const rules = parseRobotsTxt(content);

  // Find matching user-agent section (exact match, then wildcard)
  const matchingRules = rules[userAgent] ?? rules[USER_AGENT_WILDCARD];

  if (!matchingRules) {
    // No rules for this user-agent — allow
    return true;
  }

  // Check Disallow rules (longest matching prefix wins)
  let longestDisallow = '';
  for (const pattern of matchingRules.disallow) {
    if (pattern && pathname.startsWith(pattern) && pattern.length > longestDisallow.length) {
      longestDisallow = pattern;
    }
  }

  if (!longestDisallow) {
    return true; // No disallow matches
  }

  // Check if an Allow rule overrides the disallow
  for (const pattern of matchingRules.allow) {
    if (pathname.startsWith(pattern) && pattern.length >= longestDisallow.length) {
      return true;
    }
  }

  return false;
}

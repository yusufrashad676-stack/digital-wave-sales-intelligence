import { Injectable, Logger } from '@nestjs/common';
import {
  EnrichmentTimeoutError,
  EnrichmentNetworkError,
  RobotsTxtBlockedError,
} from '../../domain/errors/enrichment.errors.js';
import type {
  SocialDiscoveryRequest,
  SocialDiscoveryResult,
  DiscoveredSocialProfile,
} from '../../domain/ports/social-discovery.port.js';
import { safeFetch, type SafeFetchResult } from '../../../../common/utils/safe-fetcher.util.js';
import { assertAllowedByRobotsTxt, type RobotsTxtOptions } from '../../../../common/utils/robots-txt.util.js';

const PROVIDER_ID = 'http-social-discovery';

const SOCIAL_HOSTS: Record<string, string> = {
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'instagram.com': 'instagram',
  'linkedin.com': 'linkedin',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'youtube.com': 'youtube',
  'tiktok.com': 'tiktok',
  'pinterest.com': 'pinterest',
  'snapchat.com': 'snapchat',
};

const CONFIDENCE_FOOTER = 0.9;
const CONFIDENCE_NAV = 0.8;
const CONFIDENCE_META = 0.7;
const CONFIDENCE_BODY = 0.6;

export interface HttpSocialDiscoveryOptions {
  timeoutMs: number;
  userAgent?: string;
  robotsTxtCache?: Map<string, { allowed: boolean; fetchedAt: number }>;
}

@Injectable()
export class HttpSocialDiscoveryProvider {
  readonly providerId = PROVIDER_ID;

  private readonly logger = new Logger(HttpSocialDiscoveryProvider.name);

  constructor(
    private readonly options: HttpSocialDiscoveryOptions,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async discover(request: SocialDiscoveryRequest): Promise<SocialDiscoveryResult> {
    const { domain, timeoutMs } = request;
    const url = `https://${domain}`;

    await this.assertRobotsTxtAllows(url, timeoutMs);

    let fetchResult: SafeFetchResult;
    try {
      fetchResult = await safeFetch(url, {
        timeoutMs,
        userAgent: this.options.userAgent ?? 'DigitalWave',
        urlSafety: { allowedSchemes: ['https'] },
        fetcher: this.fetcher,
      });
    } catch (error) {
      if (error instanceof RobotsTxtBlockedError) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('timed out')) {
        throw new EnrichmentTimeoutError(PROVIDER_ID, `Website ${domain} timed out during social discovery`);
      }
      throw new EnrichmentNetworkError(
        PROVIDER_ID,
        `Failed to fetch ${domain} for social discovery: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!fetchResult.ok || !fetchResult.body) {
      return {
        profiles: [],
        discoveredAt: new Date(),
        provider: PROVIDER_ID,
      };
    }

    const profiles = extractSocialProfiles(fetchResult.body);

    return {
      profiles,
      discoveredAt: new Date(),
      provider: PROVIDER_ID,
    };
  }

  private async assertRobotsTxtAllows(url: string, timeoutMs: number): Promise<void> {
    try {
      const robotsOptions: RobotsTxtOptions = {
        timeoutMs: Math.min(timeoutMs, 3000),
        userAgent: this.options.userAgent ?? 'DigitalWave',
        cache: this.options.robotsTxtCache,
        fetcher: this.fetcher,
      };
      await assertAllowedByRobotsTxt(url, robotsOptions);
    } catch (error) {
      if (error instanceof RobotsTxtBlockedError) {
        throw error;
      }
      const domain = new URL(url).hostname;
      this.logger.debug(`robots.txt check failed for ${domain}, continuing`);
    }
  }
}

function extractSocialProfiles(html: string): DiscoveredSocialProfile[] {
  const profiles = new Map<string, DiscoveredSocialProfile>();

  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let platform: string | null = null;

    for (const [host, plat] of Object.entries(SOCIAL_HOSTS)) {
      if (hostname === host || hostname.endsWith('.' + host)) {
        platform = plat;
        break;
      }
    }

    if (!platform) continue;

    const handle = extractHandle(parsed.pathname, platform);
    if (!handle) continue;

    const profileUrl = normalizeProfileUrl(parsed, platform);
    const dedupeKey = `${platform}:${handle}`;
    const confidence = detectPlacement(match.index, match[0], html);

    const existing = profiles.get(dedupeKey);
    if (!existing || confidence > existing.confidence) {
      profiles.set(dedupeKey, {
        platform,
        handle,
        profileUrl,
        confidence,
      });
    }
  }

  return Array.from(profiles.values());
}

function extractHandle(pathname: string, platform: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  switch (platform) {
    case 'facebook': {
      // facebook.com/username or facebook.com/pages/slug/ID
      if (segments[0] === 'pages' && segments.length >= 3) {
        return segments[1] ?? null;
      }
      return segments[0] ?? null;
    }
    case 'linkedin': {
      // linkedin.com/in/username or linkedin.com/company/name
      if (segments[0] === 'in' && segments.length >= 2) {
        return segments[1] ?? null;
      }
      if (segments[0] === 'company' && segments.length >= 2) {
        return segments[1] ?? null;
      }
      return segments[0] ?? null;
    }
    case 'youtube': {
      // youtube.com/@handle or youtube.com/channel/ID or youtube.com/user/name
      if (segments[0]?.startsWith('@')) {
        return segments[0].slice(1);
      }
      if (segments[0] === 'channel' && segments.length >= 2) {
        return segments[1] ?? null;
      }
      if (segments[0] === 'user' && segments.length >= 2) {
        return segments[1] ?? null;
      }
      return segments[0] ?? null;
    }
    case 'tiktok': {
      // tiktok.com/@username
      if (segments[0]?.startsWith('@')) {
        return segments[0].slice(1);
      }
      return segments[0] ?? null;
    }
    case 'snapchat': {
      // snapchat.com/add/username
      if (segments[0] === 'add' && segments.length >= 2) {
        return segments[1] ?? null;
      }
      return segments[0] ?? null;
    }
    default:
      return segments[0] ?? null;
  }
}

function normalizeProfileUrl(parsed: URL, platform: string): string {
  const segments = parsed.pathname.split('/').filter(Boolean);

  switch (platform) {
    case 'facebook': {
      const handle = segments[0] === 'pages' ? segments[1] : segments[0];
      return `https://www.facebook.com/${handle}`;
    }
    case 'linkedin': {
      if (segments[0] === 'in') {
        return `https://www.linkedin.com/in/${segments[1]}`;
      }
      if (segments[0] === 'company') {
        return `https://www.linkedin.com/company/${segments[1]}`;
      }
      return `https://www.linkedin.com/${segments[0]}`;
    }
    case 'youtube': {
      if (segments[0]?.startsWith('@')) {
        return `https://www.youtube.com/${segments[0]}`;
      }
      if (segments[0] === 'channel' && segments[1]) {
        return `https://www.youtube.com/channel/${segments[1]}`;
      }
      if (segments[0] === 'user' && segments[1]) {
        return `https://www.youtube.com/user/${segments[1]}`;
      }
      return `https://www.youtube.com/${segments[0]}`;
    }
    case 'tiktok': {
      const tiktokHandle = segments[0]?.startsWith('@') ? segments[0] : `@${segments[0]}`;
      return `https://www.tiktok.com/${tiktokHandle}`;
    }
    case 'snapchat': {
      if (segments[0] === 'add' && segments[1]) {
        return `https://www.snapchat.com/add/${segments[1]}`;
      }
      return `https://www.snapchat.com/${segments[0]}`;
    }
    default:
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  }
}

function detectPlacement(linkStart: number, linkTag: string, html: string): number {
  const precedingHtml = html.slice(Math.max(0, linkStart - 2000), linkStart);

  if (/<footer[\s>]/i.test(precedingHtml)) {
    return CONFIDENCE_FOOTER;
  }
  if (/<nav[\s>]/i.test(precedingHtml)) {
    return CONFIDENCE_NAV;
  }
  if (/<aside[\s>]/i.test(precedingHtml)) {
    return CONFIDENCE_NAV;
  }
  if (/<\/head>/i.test(precedingHtml) === false && /<head[\s>]/i.test(precedingHtml)) {
    return CONFIDENCE_META;
  }

  return CONFIDENCE_BODY;
}

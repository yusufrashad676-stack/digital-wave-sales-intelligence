import { Injectable, Logger } from '@nestjs/common';
import {
  EnrichmentTimeoutError,
  EnrichmentNetworkError,
  RobotsTxtBlockedError,
} from '../../domain/errors/enrichment.errors.js';
import type {
  WebsiteEnrichmentPort,
  WebsiteEnrichmentRequest,
  WebsiteEnrichmentResult,
} from '../../domain/ports/website-enrichment.port.js';
import { safeFetch, type SafeFetchResult } from '../../../../common/utils/safe-fetcher.util.js';
import { assertAllowedByRobotsTxt, type RobotsTxtOptions } from '../../../../common/utils/robots-txt.util.js';

const PROVIDER_ID = 'http-website-enrichment';

const SOCIAL_DOMAINS: Record<string, string> = {
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'instagram.com': 'instagram',
  'linkedin.com': 'linkedin',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'youtube.com': 'youtube',
  'tiktok.com': 'tiktok',
  'snapchat.com': 'snapchat',
  'pinterest.com': 'pinterest',
};

const TECH_HINT_PATTERNS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /wp-content|wordpress/i, hint: 'wordpress' },
  { pattern: /shopify/i, hint: 'shopify' },
  { pattern: /wix\.com/i, hint: 'wix' },
  { pattern: /squarespace/i, hint: 'squarespace' },
  { pattern: /react/i, hint: 'react' },
  { pattern: /vue\.js|vuejs/i, hint: 'vue' },
  { pattern: /angular/i, hint: 'angular' },
  { pattern: /next\.?js/i, hint: 'nextjs' },
  { pattern: /nuxt/i, hint: 'nuxt' },
  { pattern: /gatsby/i, hint: 'gatsby' },
  { pattern: /tailwind/i, hint: 'tailwind' },
  { pattern: /bootstrap/i, hint: 'bootstrap' },
  { pattern: /jquery/i, hint: 'jquery' },
  { pattern: /laravel/i, hint: 'laravel' },
  { pattern: /django/i, hint: 'django' },
  { pattern: /rails|ruby/i, hint: 'rails' },
  { pattern: /spring/i, hint: 'spring' },
  { pattern: /google-analytics|gtag/i, hint: 'google-analytics' },
  { pattern: /gtm\.js|googletagmanager/i, hint: 'google-tag-manager' },
  { pattern: /facebook.*pixel|fbevents/i, hint: 'facebook-pixel' },
];

export interface HttpWebsiteEnrichmentOptions {
  timeoutMs: number;
  userAgent?: string;
  robotsTxtCache?: Map<string, { allowed: boolean; fetchedAt: number }>;
}

@Injectable()
export class HttpWebsiteEnrichmentProvider implements WebsiteEnrichmentPort {
  readonly providerId = PROVIDER_ID;

  private readonly logger = new Logger(HttpWebsiteEnrichmentProvider.name);

  constructor(
    private readonly options: HttpWebsiteEnrichmentOptions,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async enrich(request: WebsiteEnrichmentRequest): Promise<WebsiteEnrichmentResult> {
    const { domain, timeoutMs } = request;
    const url = `https://${domain}`;

    // Check robots.txt before fetching
    await this.assertRobotsTxtAllows(url, timeoutMs);

    const result = await this.fetchAndParse(url, timeoutMs);
    return result;
  }

  private async assertRobotsTxtAllows(url: string, timeoutMs: number): Promise<void> {
    try {
      const robotsOptions: RobotsTxtOptions = {
        timeoutMs: Math.min(timeoutMs, 3000), // Cap robots.txt timeout
        userAgent: this.options.userAgent ?? 'DigitalWave',
        cache: this.options.robotsTxtCache,
        fetcher: this.fetcher,
      };
      await assertAllowedByRobotsTxt(url, robotsOptions);
    } catch (error) {
      if (error instanceof RobotsTxtBlockedError) {
        throw error;
      }
      // robots.txt fetch failure — fail open, continue with enrichment
      const domain = new URL(url).hostname;
      this.logger.debug(`robots.txt check failed for ${domain}, continuing`);
    }
  }

  private async fetchAndParse(url: string, timeoutMs: number): Promise<WebsiteEnrichmentResult> {
    const domain = new URL(url).hostname;

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
        throw new EnrichmentTimeoutError(PROVIDER_ID, `Website ${domain} timed out`);
      }
      throw new EnrichmentNetworkError(
        PROVIDER_ID,
        `Failed to fetch ${domain}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!fetchResult.ok || !fetchResult.body) {
      return {
        domain,
        data: {
          title: null,
          description: null,
          techHints: [],
          socialLinks: [],
          fetchedAt: new Date().toISOString(),
          provider: PROVIDER_ID,
        },
      };
    }

    const html = fetchResult.body;
    const title = extractTitle(html);
    const description = extractDescription(html);
    const socialLinks = extractSocialLinks(html);
    const techHints = extractTechHints(html);

    return {
      domain,
      data: {
        title,
        description,
        techHints,
        socialLinks,
        fetchedAt: new Date().toISOString(),
        provider: PROVIDER_ID,
      },
    };
  }
}

function extractTitle(html: string): string | null {
  // Try <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].trim());
  }

  // Try og:title
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogMatch?.[1]) {
    return decodeHtmlEntities(ogMatch[1].trim());
  }

  return null;
}

function extractDescription(html: string): string | null {
  // Try meta description
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (metaMatch?.[1]) {
    return decodeHtmlEntities(metaMatch[1].trim());
  }

  // Try og:description
  const ogMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (ogMatch?.[1]) {
    return decodeHtmlEntities(ogMatch[1].trim());
  }

  return null;
}

function extractSocialLinks(html: string): string[] {
  const links = new Set<string>();

  // Match href attributes pointing to social domains
  const hrefPattern = /href=["'](https?:\/\/[^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html)) !== null) {
    const url = match[1];
    if (!url) continue;
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

      for (const [domain, platform] of Object.entries(SOCIAL_DOMAINS)) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          links.add(`${platform}:${url}`);
          break;
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return Array.from(links);
}

function extractTechHints(html: string): string[] {
  const hints = new Set<string>();

  for (const { pattern, hint } of TECH_HINT_PATTERNS) {
    if (pattern.test(html)) {
      hints.add(hint);
    }
  }

  return Array.from(hints);
}

const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  eacute: '\u00e9',
  egrave: '\u00e8',
  agrave: '\u00e0',
  aacute: '\u00e1',
  ograve: '\u00f2',
  oacute: '\u00f3',
  ugrave: '\u00f9',
  uacute: '\u00fa',
  ccedil: '\u00e7',
  ntilde: '\u00f1',
  iacute: '\u00ed',
  igrave: '\u00ec',
  uuml: '\u00fc',
  ouml: '\u00f6',
  auml: '\u00e4',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  nbsp: '\u00a0',
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bull: '\u2022',
  hellip: '\u2026',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCharCode(code);
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCharCode(code);
    }
    return HTML_NAMED_ENTITIES[entity] ?? match;
  });
}

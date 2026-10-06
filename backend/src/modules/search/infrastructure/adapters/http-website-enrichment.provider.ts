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
          emails: [],
          bodyAnalyzed: false,
          reachable: true,
          https: true,
          contactPageUrl: null,
          hasContactForm: false,
          bookingPageUrl: null,
          whatsappUrl: null,
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
    const emails = extractEmails(html);
    const contactPageUrl = extractContactPageUrl(html);
    const bookingPageUrl = extractBookingPageUrl(html);
    const whatsappUrl = extractWhatsappUrl(html);
    const hasContactForm = detectContactForm(html);

    return {
      domain,
      data: {
        title,
        description,
        techHints,
        socialLinks,
        emails,
        bodyAnalyzed: true,
        reachable: true,
        https: true,
        contactPageUrl,
        hasContactForm,
        bookingPageUrl,
        whatsappUrl,
        fetchedAt: new Date().toISOString(),
        provider: PROVIDER_ID,
      },
    };
  }
}

export function extractTitle(html: string): string | null {
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

export function extractDescription(html: string): string | null {
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

const MAX_EMAILS = 10;

const EMAIL_IN_TEXT_PATTERN =
  /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+/g;

/**
 * Extract observed email addresses from first-party page content: mailto: links
 * and bare email-pattern matches. Bounded, deduplicated, lowercase. This is
 * "observed" evidence only — nothing here is guessed or inferred.
 */
export function extractEmails(html: string): string[] {
  const emails = new Set<string>();

  const visit = (candidate: string): void => {
    const email = candidate.trim().toLowerCase();
    if (email.length === 0 || /\.\./.test(email)) {
      return;
    }
    const fresh = new RegExp(EMAIL_IN_TEXT_PATTERN.source, '');
    if (fresh.test(email)) {
      emails.add(email);
    }
  };

  const mailtoPattern = /mailto:([^"'<>\s>]+)/gi;
  let mailtoMatch: RegExpExecArray | null;
  while ((mailtoMatch = mailtoPattern.exec(html)) !== null && emails.size < MAX_EMAILS) {
    visit(mailtoMatch[1]?.split('?')[0] ?? '');
  }

  let textMatch: RegExpExecArray | null;
  while ((textMatch = EMAIL_IN_TEXT_PATTERN.exec(html)) !== null && emails.size < MAX_EMAILS) {
    visit(textMatch[0]);
  }

  return Array.from(emails).slice(0, MAX_EMAILS);
}

const CONTACT_HREF_PATTERNS = [
  /^\/(?:contact|contact-us|about|support|reach-us)[^"'<>\s]*\/?$/i,
  /^\/(?:pages\/)?contact[^"'<>\s]*$/i,
];
const CONTACT_TEXT_PATTERNS = [/contact(?: us)?\b/i];

export function extractContactPageUrl(html: string): string | null {
  return extractMatchingPageUrl(html, CONTACT_HREF_PATTERNS, CONTACT_TEXT_PATTERNS);
}

const BOOKING_HREF_PATTERNS = [
  /^\/(?:book|booking|reservation|reserve|appointment|schedule|make-an-appointment|book-an-appointment)[^"'<>\s]*$/i,
];
const BOOKING_TEXT_PATTERNS = [
  /book(?:\s+a)?\s+(?:now|an appointment|an\s?appointment|an online appointment)?/i,
  /reservations?\b/i,
];

export function extractBookingPageUrl(html: string): string | null {
  return extractMatchingPageUrl(html, BOOKING_HREF_PATTERNS, BOOKING_TEXT_PATTERNS);
}

export function extractWhatsappUrl(html: string): string | null {
  const hrefPattern = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    const url = match[1];
    if (url === undefined) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const lower = parsed.origin.toLowerCase();
    if (lower === 'https://wa.me' || lower === 'https://api.whatsapp.com') {
      return parsed.toString();
    }
  }
  return null;
}

export function extractMatchingPageUrl(html: string, hrefPatterns: RegExp[], textPatterns: RegExp[]): string | null {
  const hrefPattern = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1];
    if (href === undefined) continue;
    for (const pattern of hrefPatterns) {
      if (pattern.test(href)) {
        return href;
      }
    }
  }

  // Fall back to anchor text (e.g. "Contact us", "Book now").
  const anchorPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1];
    const label = match[2];
    if (href === undefined || label === undefined) continue;
    for (const textPattern of textPatterns) {
      if (textPattern.test(label)) {
        return href;
      }
    }
  }
  return null;
}

export function detectContactForm(html: string): boolean {
  const formPattern = /<form\b[^>]*>/gi;
  let formMatch: RegExpExecArray | null;
  while ((formMatch = formPattern.exec(html)) !== null) {
    const formTag = formMatch[0];
    // Only treat a form as a contact form when it clearly collects contact info.
    if (
      /input[^>]*type=["']email["']/i.test(html.slice(formMatch.index, formMatch.index + 2000)) ||
      /<textarea\b/i.test(html.slice(formMatch.index, formMatch.index + 2000)) ||
      /name=["'](email|phone|message|captcha)["']/i.test(formTag)
    ) {
      return true;
    }
  }
  return false;
}

export function extractSocialLinks(html: string): string[] {
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

export function extractTechHints(html: string): string[] {
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

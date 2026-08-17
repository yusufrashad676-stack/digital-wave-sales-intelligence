import { Injectable, Logger } from '@nestjs/common';
import {
  EnrichmentTimeoutError,
  EnrichmentNetworkError,
  RobotsTxtBlockedError,
} from '../../domain/errors/enrichment.errors.js';
import type {
  SocialVerificationRequest,
  SocialVerificationResult,
} from '../../domain/ports/social-verification.port.js';
import { safeFetch, type SafeFetchResult } from '../../../../common/utils/safe-fetcher.util.js';
import { assertAllowedByRobotsTxt, type RobotsTxtOptions } from '../../../../common/utils/robots-txt.util.js';

const PROVIDER_ID = 'http-social-verification';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

const SUSPENSION_PATTERNS: RegExp[] = [
  /account.*suspended/i,
  /account.*disabled/i,
  /account.*removed/i,
  /page.*not found/i,
  /profile.*unavailable/i,
  /this.*account.*private/i,
  /you.*blocked/i,
];

export interface HttpSocialVerificationOptions {
  timeoutMs: number;
  userAgent?: string;
  robotsTxtCache?: Map<string, { allowed: boolean; fetchedAt: number }>;
}

@Injectable()
export class HttpSocialVerificationProvider {
  readonly providerId = PROVIDER_ID;

  private readonly logger = new Logger(HttpSocialVerificationProvider.name);

  constructor(
    private readonly options: HttpSocialVerificationOptions,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async verify(request: SocialVerificationRequest): Promise<SocialVerificationResult> {
    const { profileUrl, timeoutMs } = request;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.attemptVerify(profileUrl, timeoutMs);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof EnrichmentTimeoutError) {
          throw error;
        }

        if (error instanceof RobotsTxtBlockedError) {
          throw error;
        }

        if (error instanceof Error && error.message.includes('timed out')) {
          throw new EnrichmentTimeoutError(PROVIDER_ID, `Verification of ${profileUrl} timed out`);
        }

        if (attempt < MAX_RETRIES - 1) {
          const retryAfter = this.parseRetryAfter(error) ?? RETRY_BASE_MS * 2 ** attempt;
          this.logger.debug(`Retry ${attempt + 1}/${MAX_RETRIES} for ${profileUrl} after ${retryAfter}ms`);
          await delay(retryAfter);
        }
      }
    }

    throw new EnrichmentNetworkError(
      PROVIDER_ID,
      `Failed to verify ${profileUrl} after ${MAX_RETRIES} attempts: ${lastError?.message ?? 'unknown'}`,
    );
  }

  private async attemptVerify(profileUrl: string, timeoutMs: number): Promise<SocialVerificationResult> {
    await this.assertRobotsTxtAllows(profileUrl, timeoutMs);

    let fetchResult: SafeFetchResult;
    try {
      fetchResult = await safeFetch(profileUrl, {
        timeoutMs,
        userAgent: this.options.userAgent ?? 'DigitalWave',
        urlSafety: { allowedSchemes: ['https'] },
        fetcher: this.fetcher,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        throw new EnrichmentTimeoutError(PROVIDER_ID, `Profile ${profileUrl} timed out`);
      }
      throw new EnrichmentNetworkError(
        PROVIDER_ID,
        `Failed to fetch ${profileUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (fetchResult.status === 429) {
      throw new EnrichmentNetworkError(PROVIDER_ID, `Rate limited on ${profileUrl}`);
    }

    if (fetchResult.status === 404) {
      return {
        exists: false,
        active: false,
        displayName: null,
        verifiedAt: new Date(),
        provider: PROVIDER_ID,
      };
    }

    const exists = fetchResult.status >= 200 && fetchResult.status < 500;
    let active = exists;

    if (exists && fetchResult.body) {
      active = !detectSuspension(fetchResult.body);
    }

    const displayName = exists && fetchResult.body ? extractDisplayName(fetchResult.body) : null;

    return {
      exists,
      active,
      displayName,
      verifiedAt: new Date(),
      provider: PROVIDER_ID,
    };
  }

  private parseRetryAfter(error: unknown): number | null {
    if (error instanceof Error && 'status' in error && typeof (error as { status?: unknown }).status === 'number') {
      const status = (error as { status: number }).status;
      if (status === 429) {
        return RETRY_BASE_MS * 2;
      }
    }
    return null;
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

function detectSuspension(html: string): boolean {
  return SUSPENSION_PATTERNS.some((pattern) => pattern.test(html));
}

function extractDisplayName(html: string): string | null {
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch?.[1]) {
    return decodeHtmlEntities(ogTitleMatch[1].trim());
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    const title = decodeHtmlEntities(titleMatch[1].trim());
    const platformSuffix = title.match(
      /\s[|–—-]+\s*(Facebook|Instagram|LinkedIn|Twitter|YouTube|TikTok|Snapchat|Pinterest|X)$/i,
    );
    if (platformSuffix?.index != null) {
      return title.slice(0, platformSuffix.index).trim();
    }
    return title;
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

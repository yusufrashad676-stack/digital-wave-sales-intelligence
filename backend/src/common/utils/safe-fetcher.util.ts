import { Logger } from '@nestjs/common';
import { checkUrlSafety, type UrlSafetyOptions } from './url-safety.util.js';
import { UrlSafetyError } from '../../modules/search/domain/errors/enrichment.errors.js';

const logger = new Logger('SafeFetcher');

const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576; // 1 MB
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_USER_AGENT = 'DigitalWave/1.0';
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export interface SafeFetchOptions {
  timeoutMs: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  urlSafety?: UrlSafetyOptions;
  method?: string;
  headers?: Record<string, string>;
  fetcher?: typeof fetch;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  contentType: string | null;
  body: string | null;
  redirected: boolean;
  finalUrl: string;
}

export async function safeFetch(url: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const {
    timeoutMs,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    userAgent = DEFAULT_USER_AGENT,
    urlSafety: urlSafetyOptions = {},
    method = 'GET',
    headers = {},
    fetcher = fetch,
  } = options;

  // Initial URL safety check
  await assertUrlSafeForFetch(url, urlSafetyOptions);

  let currentUrl = url;
  let redirectCount = 0;
  let lastResponse: Response | null = null;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetcher(currentUrl, {
        method: redirectCount === 0 ? method : 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,*/*',
          ...headers,
        },
        signal: controller.signal,
        redirect: 'manual', // We handle redirects manually
      });

      clearTimeout(timeoutId);

      // Handle redirects
      if (REDIRECT_STATUS_CODES.has(response.status)) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          logger.warn(`Redirect limit exceeded after ${maxRedirects} hops`);
          break;
        }

        const location = response.headers.get('Location');
        if (!location) {
          logger.warn('Redirect response missing Location header');
          break;
        }

        // Resolve redirect URL (handles relative redirects)
        let redirectUrl: string;
        try {
          redirectUrl = new URL(location, currentUrl).href;
        } catch {
          logger.warn(`Invalid redirect URL: ${location}`);
          break;
        }

        // Re-validate redirect target for SSRF
        await assertUrlSafeForFetch(redirectUrl, urlSafetyOptions);

        currentUrl = redirectUrl;
        lastResponse = response;
        continue;
      }

      // Non-redirect response
      lastResponse = response;
      break;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof UrlSafetyError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new UrlSafetyError(`Request to ${currentUrl} timed out after ${timeoutMs}ms`);
      }

      throw new UrlSafetyError(
        `Network error fetching ${currentUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!lastResponse) {
    throw new UrlSafetyError(`No response received from ${url}`);
  }

  const contentType = lastResponse.headers.get('content-type');

  let body: string | null = null;
  if (lastResponse.body) {
    const reader = lastResponse.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalBytes += value.length;
          if (totalBytes > maxResponseBytes) {
            reader.cancel();
            logger.warn(`Response exceeded ${maxResponseBytes} bytes, truncating`);
            break;
          }

          chunks.push(value);
        }
      } catch {
        // Partial read is acceptable
      }

      const decoder = new TextDecoder('utf-8', { fatal: false });
      body = decoder.decode(Buffer.concat(chunks));
    }
  }

  return {
    ok: lastResponse.ok,
    status: lastResponse.status,
    contentType,
    body,
    redirected: redirectCount > 0,
    finalUrl: currentUrl,
  };
}

async function assertUrlSafeForFetch(url: string, options: UrlSafetyOptions): Promise<void> {
  const result = await checkUrlSafety(url, options);
  if (!result.safe) {
    throw new UrlSafetyError(result.reason ?? 'URL failed safety check');
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

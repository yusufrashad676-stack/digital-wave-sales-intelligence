import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpSocialVerificationProvider } from './http-social-verification.provider.js';
import {
  EnrichmentTimeoutError,
  EnrichmentNetworkError,
  RobotsTxtBlockedError,
} from '../../domain/errors/enrichment.errors.js';

function mockHtmlResponse(html: string, status = 200): Response {
  const encoder = new TextEncoder();
  const bodyBytes = encoder.encode(html);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/html' }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bodyBytes);
        controller.close();
      },
    }),
  } as unknown as Response;
}

function mockTextResponse(content: string, status = 200): Response {
  const encoder = new TextEncoder();
  const bodyBytes = encoder.encode(content);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/plain' }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bodyBytes);
        controller.close();
      },
    }),
  } as unknown as Response;
}

function allowAllFetcher(profileHtml = '<html></html>'): typeof fetch {
  return async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (urlStr.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
    return mockHtmlResponse(profileHtml);
  };
}

describe('HttpSocialVerificationProvider', () => {
  const defaultOptions = {
    timeoutMs: 5000,
    userAgent: 'TestBot',
    robotsTxtCache: new Map(),
  };

  it('returns exists + active for 200 response with normal page', async () => {
    const html = `<html><head><title>John Doe | Facebook</title></head><body>Profile content</body></html>`;
    const fetcher = allowAllFetcher(html);

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/johndoe',
      handle: 'johndoe',
      timeoutMs: 5000,
    });

    assert.equal(result.exists, true);
    assert.equal(result.active, true);
    assert.equal(result.provider, 'http-social-verification');
  });

  it('returns exists=false for 404 response', async () => {
    const fetcher = async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse('Not Found', 404);
    };

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'twitter',
      profileUrl: 'https://twitter.com/nonexistent',
      handle: 'nonexistent',
      timeoutMs: 5000,
    });

    assert.equal(result.exists, false);
    assert.equal(result.active, false);
    assert.equal(result.displayName, null);
  });

  it('returns exists=true for 403 response (blocked but exists)', async () => {
    const fetcher = async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse('Forbidden', 403);
    };

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'instagram',
      profileUrl: 'https://instagram.com/privateuser',
      handle: 'privateuser',
      timeoutMs: 5000,
    });

    assert.equal(result.exists, true);
    assert.equal(result.active, true);
  });

  it('detects suspended account', async () => {
    const html = `<html><body><p>This account has been suspended.</p></body></html>`;
    const fetcher = allowAllFetcher(html);

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'twitter',
      profileUrl: 'https://twitter.com/suspended',
      handle: 'suspended',
      timeoutMs: 5000,
    });

    assert.equal(result.exists, true);
    assert.equal(result.active, false);
  });

  it('detects disabled account', async () => {
    const html = `<html><body><p>This account has been disabled.</p></body></html>`;
    const fetcher = allowAllFetcher(html);

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/disabled',
      handle: 'disabled',
      timeoutMs: 5000,
    });

    assert.equal(result.exists, true);
    assert.equal(result.active, false);
  });

  it('extracts displayName from og:title', async () => {
    const html = `<html><head><meta property="og:title" content="John Doe"></head><body></body></html>`;
    const fetcher = allowAllFetcher(html);

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/johndoe',
      handle: 'johndoe',
      timeoutMs: 5000,
    });

    assert.equal(result.displayName, 'John Doe');
  });

  it('extracts displayName from title tag when og:title absent', async () => {
    const html = `<html><head><title>John Doe | Facebook</title></head><body></body></html>`;
    const fetcher = allowAllFetcher(html);

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/johndoe',
      handle: 'johndoe',
      timeoutMs: 5000,
    });

    assert.equal(result.displayName, 'John Doe');
  });

  it('strips platform suffix from title for displayName', async () => {
    const html = `<html><head><title>My Business — Instagram</title></head><body></body></html>`;
    const fetcher = allowAllFetcher(html);

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'instagram',
      profileUrl: 'https://instagram.com/mybusiness',
      handle: 'mybusiness',
      timeoutMs: 5000,
    });

    assert.equal(result.displayName, 'My Business');
  });

  it('sets verifiedAt to current date', async () => {
    const fetcher = allowAllFetcher();

    const before = Date.now();
    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/test',
      handle: 'test',
      timeoutMs: 5000,
    });
    const after = Date.now();

    assert.ok(result.verifiedAt.getTime() >= before);
    assert.ok(result.verifiedAt.getTime() <= after);
  });

  it('throws EnrichmentTimeoutError on timeout', async () => {
    const fetcher = async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    };

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    await assert.rejects(
      () =>
        provider.verify({
          platform: 'facebook',
          profileUrl: 'https://facebook.com/slow',
          handle: 'slow',
          timeoutMs: 5000,
        }),
      EnrichmentTimeoutError,
    );
  });

  it('retries on network failure and eventually throws', async () => {
    let attempts = 0;
    const fetcher = async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      attempts++;
      throw new Error('ECONNREFUSED');
    };

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    await assert.rejects(
      () =>
        provider.verify({
          platform: 'facebook',
          profileUrl: 'https://facebook.com/down',
          handle: 'down',
          timeoutMs: 5000,
        }),
      EnrichmentNetworkError,
    );

    assert.equal(attempts, 3);
  });

  it('succeeds on retry after initial failure', async () => {
    let attempts = 0;
    const fetcher = async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      attempts++;
      if (attempts === 1) throw new Error('ECONNRESET');
      return mockHtmlResponse('<html><head><title>OK</title></head></html>');
    };

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/retry',
      handle: 'retry',
      timeoutMs: 5000,
    });

    assert.equal(result.exists, true);
    assert.equal(attempts, 2);
  });

  it('throws RobotsTxtBlockedError when URL is disallowed', async () => {
    const fetcher = async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('robots.txt')) return mockTextResponse('User-agent: *\nDisallow: /');
      return mockHtmlResponse('<html></html>');
    };

    const freshOptions = { ...defaultOptions, robotsTxtCache: new Map() };
    const provider = new HttpSocialVerificationProvider(freshOptions, fetcher);
    await assert.rejects(
      () =>
        provider.verify({
          platform: 'facebook',
          profileUrl: 'https://facebook.com/blocked',
          handle: 'blocked',
          timeoutMs: 5000,
        }),
      (error: unknown) => {
        assert.ok(error instanceof RobotsTxtBlockedError);
        return true;
      },
    );
  });

  it('does not retry when robots.txt blocks the URL', async () => {
    let fetchCount = 0;
    const fetcher = async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('robots.txt')) {
        fetchCount++;
        return mockTextResponse('User-agent: *\nDisallow: /');
      }
      return mockHtmlResponse('<html></html>');
    };

    const freshOptions = { ...defaultOptions, robotsTxtCache: new Map() };
    const provider = new HttpSocialVerificationProvider(freshOptions, fetcher);
    await assert.rejects(
      () =>
        provider.verify({
          platform: 'facebook',
          profileUrl: 'https://facebook.com/noretry',
          handle: 'noretry',
          timeoutMs: 5000,
        }),
      RobotsTxtBlockedError,
    );

    assert.equal(fetchCount, 1);
  });

  it('detects removed account', async () => {
    const html = `<html><body><p>This account has been removed.</p></body></html>`;
    const fetcher = allowAllFetcher(html);

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/removed',
      handle: 'removed',
      timeoutMs: 5000,
    });

    assert.equal(result.exists, true);
    assert.equal(result.active, false);
  });

  it('returns null displayName when no title or og:title present', async () => {
    const html = `<html><body><p>Profile content</p></body></html>`;
    const fetcher = allowAllFetcher(html);

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/notitle',
      handle: 'notitle',
      timeoutMs: 5000,
    });

    assert.equal(result.displayName, null);
  });

  it('handles empty body response', async () => {
    const fetcher = allowAllFetcher('');

    const provider = new HttpSocialVerificationProvider(defaultOptions, fetcher);
    const result = await provider.verify({
      platform: 'facebook',
      profileUrl: 'https://facebook.com/empty',
      handle: 'empty',
      timeoutMs: 5000,
    });

    assert.equal(result.exists, true);
    assert.equal(result.active, true);
    assert.equal(result.displayName, null);
  });
});

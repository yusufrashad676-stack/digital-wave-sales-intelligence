import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRobotsTxt, checkRobotsTxt, assertAllowedByRobotsTxt } from './robots-txt.util.js';
import { RobotsTxtBlockedError } from '../../modules/search/domain/errors/enrichment.errors.js';

// Helper to create a mock Response with proper ReadableStream body
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

describe('RobotsTxt', () => {
  describe('parseRobotsTxt', () => {
    it('parses basic robots.txt with Allow and Disallow', () => {
      const content = `User-agent: *
Disallow: /private/
Allow: /private/public/`;

      const rules = parseRobotsTxt(content);
      assert.deepEqual(rules['*'], {
        allow: ['/private/public/'],
        disallow: ['/private/'],
      });
    });

    it('handles comments', () => {
      const content = `# This is a comment
User-agent: *
Disallow: /admin/ # inline comment`;

      const rules = parseRobotsTxt(content);
      assert.deepEqual(rules['*'], {
        allow: [],
        disallow: ['/admin/'],
      });
    });

    it('handles multiple user-agent sections', () => {
      const content = `User-agent: Googlebot
Disallow: /no-google/

User-agent: Bingbot
Disallow: /no-bing/

User-agent: *
Disallow: /private/`;

      const rules = parseRobotsTxt(content);
      assert.ok(rules['Googlebot']);
      assert.ok(rules['Bingbot']);
      assert.ok(rules['*']);
    });

    it('returns empty rules for empty content', () => {
      const rules = parseRobotsTxt('');
      assert.deepEqual(rules, {});
    });
  });

  describe('checkRobotsTxt', () => {
    it('allows URL when robots.txt cannot be fetched (fail open)', async () => {
      const fetcher = async () => {
        throw new Error('Network error');
      };

      const allowed = await checkRobotsTxt('https://example.com/page', {
        timeoutMs: 3000,
        fetcher,
      });

      assert.equal(allowed, true);
    });

    it('allows URL when robots.txt is empty', async () => {
      const fetcher = async () => mockTextResponse('');

      const allowed = await checkRobotsTxt('https://example.com/page', {
        timeoutMs: 3000,
        fetcher,
      });

      assert.equal(allowed, true);
    });

    it('blocks URL when Disallow matches', async () => {
      const robotsContent = `User-agent: *
Disallow: /admin/`;

      const fetcher = async (url: string) => {
        if (url.includes('robots.txt')) {
          return mockTextResponse(robotsContent);
        }
        return mockTextResponse('');
      };

      const allowed = await checkRobotsTxt('https://example.com/admin/secret', {
        timeoutMs: 3000,
        fetcher,
      });

      assert.equal(allowed, false);
    });

    it('allows URL when Allow overrides Disallow', async () => {
      const robotsContent = `User-agent: *
Disallow: /admin/
Allow: /admin/public/`;

      const fetcher = async (url: string) => {
        if (url.includes('robots.txt')) {
          return mockTextResponse(robotsContent);
        }
        return mockTextResponse('');
      };

      const allowed = await checkRobotsTxt('https://example.com/admin/public/page', {
        timeoutMs: 3000,
        fetcher,
      });

      assert.equal(allowed, true);
    });

    it('throws RobotsTxtBlockedError when blocked', async () => {
      const robotsContent = `User-agent: *
Disallow: /private/`;

      const fetcher = async (url: string) => {
        if (url.includes('robots.txt')) {
          return mockTextResponse(robotsContent);
        }
        return mockTextResponse('');
      };

      await assert.rejects(
        () =>
          assertAllowedByRobotsTxt('https://example.com/private/secret', {
            timeoutMs: 3000,
            fetcher,
          }),
        RobotsTxtBlockedError,
      );
    });

    it('uses cache for subsequent requests', async () => {
      let fetchCount = 0;
      const fetcher = async (url: string) => {
        if (url.includes('robots.txt')) {
          fetchCount++;
          return mockTextResponse('User-agent: *\nDisallow: /admin/');
        }
        return mockTextResponse('');
      };

      const cache = new Map();

      await checkRobotsTxt('https://example.com/page', {
        timeoutMs: 3000,
        fetcher,
        cache,
      });

      await checkRobotsTxt('https://example.com/page', {
        timeoutMs: 3000,
        fetcher,
        cache,
      });

      assert.equal(fetchCount, 1, 'robots.txt should only be fetched once due to cache');
    });
  });
});

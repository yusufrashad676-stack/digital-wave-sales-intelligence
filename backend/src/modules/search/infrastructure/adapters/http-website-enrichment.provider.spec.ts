import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpWebsiteEnrichmentProvider } from './http-website-enrichment.provider.js';
import { EnrichmentTimeoutError, EnrichmentNetworkError } from '../../domain/errors/enrichment.errors.js';

// Helper to create a mock Response with proper ReadableStream body
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

describe('HttpWebsiteEnrichmentProvider', () => {
  const defaultOptions = {
    timeoutMs: 5000,
    userAgent: 'TestBot',
    robotsTxtCache: new Map(),
  };

  it('extracts title and description from HTML', async () => {
    const html = `
      <html>
        <head>
          <title>My Business</title>
          <meta name="description" content="We provide great services">
        </head>
        <body></body>
      </html>
    `;

    let fetchedUrl = '';
    const fetcher = async (url: string) => {
      fetchedUrl = url;
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse(html);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.domain, 'example.com');
    assert.equal(result.data.title, 'My Business');
    assert.equal(result.data.description, 'We provide great services');
    assert.equal(fetchedUrl, 'https://example.com');
  });

  it('extracts social links from HTML', async () => {
    const html = `
      <html>
        <body>
          <a href="https://facebook.com/mybusiness">Facebook</a>
          <a href="https://instagram.com/mybusiness">Instagram</a>
          <a href="https://linkedin.com/company/mybusiness">LinkedIn</a>
        </body>
      </html>
    `;

    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse(html);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.ok(result.data.socialLinks.length >= 3);
    assert.ok(result.data.socialLinks.some((l) => l.includes('facebook')));
    assert.ok(result.data.socialLinks.some((l) => l.includes('instagram')));
    assert.ok(result.data.socialLinks.some((l) => l.includes('linkedin')));
  });

  it('detects technology hints', async () => {
    const html = `
      <html>
        <head>
          <meta name="generator" content="WordPress 6.0">
          <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script>
        </head>
        <body></body>
      </html>
    `;

    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse(html);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.ok(result.data.techHints.includes('wordpress'));
    assert.ok(result.data.techHints.includes('react'));
  });

  it('handles missing title and description', async () => {
    const html = '<html><body><p>No metadata here</p></body></html>';

    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse(html);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.title, null);
    assert.equal(result.data.description, null);
    assert.deepEqual(result.data.socialLinks, []);
    assert.equal(result.data.bodyAnalyzed, true);
  });

  it('returns empty data on non-200 response', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse('', 404);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.title, null);
    assert.equal(result.data.description, null);
    assert.equal(result.data.bodyAnalyzed, false);
    assert.equal(result.data.fetchedAt !== undefined, true);
  });

  it('marks bodyAnalyzed false when the response carries no analyzable body', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse('');
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.bodyAnalyzed, false);
    assert.equal(result.data.title, null);
  });

  it('persists HTTP 500 metadata while keeping bodyAnalyzed false', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse('', 500);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.bodyAnalyzed, false);
    assert.equal(result.data.httpStatus, 500);
    assert.equal(result.data.httpRedirected, false);
    assert.equal(result.data.httpFinalUrl, 'https://example.com');
    assert.equal(result.data.httpFinalSameOrigin, true);
  });

  it('persists HTTP 404 metadata while keeping bodyAnalyzed false', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse('', 404);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.bodyAnalyzed, false);
    assert.equal(result.data.httpStatus, 404);
    assert.equal(result.data.httpFinalUrl, 'https://example.com');
    assert.equal(result.data.httpFinalSameOrigin, true);
  });

  it('persists HTTP 410 metadata while keeping bodyAnalyzed false', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse('', 410);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.bodyAnalyzed, false);
    assert.equal(result.data.httpStatus, 410);
    assert.equal(result.data.httpFinalSameOrigin, true);
  });

  it('persists HTTP 200 metadata alongside analyzed capability fields', async () => {
    const html = '<html><head><title>Acme</title></head></html>';
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse(html);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.bodyAnalyzed, true);
    assert.equal(result.data.httpStatus, 200);
    assert.equal(result.data.httpRedirected, false);
    assert.equal(result.data.httpFinalUrl, 'https://example.com');
    assert.equal(result.data.httpFinalSameOrigin, true);
  });

  it('persists redirect metadata for a same-origin redirected root response', async () => {
    const html = '<html><head><title>Acme</title></head></html>';
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      if (url === 'https://example.com') {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ 'content-type': 'text/plain', location: 'https://example.com/' }),
          body: null,
        } as unknown as Response;
      }
      return mockHtmlResponse(html);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.httpStatus, 200);
    assert.equal(result.data.httpRedirected, true);
    assert.equal(result.data.httpFinalUrl, 'https://example.com/');
    assert.equal(result.data.httpFinalSameOrigin, true);
    assert.equal(result.data.bodyAnalyzed, true);
  });

  it('throws EnrichmentTimeoutError on timeout', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    await assert.rejects(() => provider.enrich({ domain: 'example.com', timeoutMs: 5000 }), EnrichmentTimeoutError);
  });

  it('throws EnrichmentNetworkError on network failure', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      throw new Error('ECONNREFUSED');
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    await assert.rejects(() => provider.enrich({ domain: 'example.com', timeoutMs: 5000 }), EnrichmentNetworkError);
  });

  it('blocks robots.txt disallowed URLs', async () => {
    const robotsContent = 'User-agent: *\nDisallow: /';
    const html = '<html><head><title>Admin</title></head></html>';

    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse(robotsContent);
      }
      return mockHtmlResponse(html);
    };

    const freshOptions = { ...defaultOptions, robotsTxtCache: new Map() };
    const provider = new HttpWebsiteEnrichmentProvider(freshOptions, fetcher);
    await assert.rejects(() => provider.enrich({ domain: 'example.com', timeoutMs: 5000 }), {
      name: 'RobotsTxtBlockedError',
    });
  });

  it('extracts og:title when title tag missing', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Description">
        </head>
        <body></body>
      </html>
    `;

    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse(html);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.title, 'OG Title');
    assert.equal(result.data.description, 'OG Description');
  });

  it('decodes HTML entities in title', async () => {
    const html = '<html><head><title>Caf&eacute; &amp; Restaurant</title></head></html>';

    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) {
        return mockTextResponse('User-agent: *\nAllow: /');
      }
      return mockHtmlResponse(html);
    };

    const provider = new HttpWebsiteEnrichmentProvider(defaultOptions, fetcher);
    const result = await provider.enrich({ domain: 'example.com', timeoutMs: 5000 });

    assert.equal(result.data.title, 'Café & Restaurant');
  });
});

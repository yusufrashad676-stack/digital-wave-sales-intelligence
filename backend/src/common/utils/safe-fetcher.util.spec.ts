import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeFetch } from './safe-fetcher.util.js';
import { UrlSafetyError } from '../../modules/search/domain/errors/enrichment.errors.js';

// Helper to create a mock Response with proper ReadableStream body
function mockResponse(options: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  redirect?: string;
}): Response {
  const { status = 200, headers = {}, body = '', redirect } = options;

  const responseHeaders = new Headers(headers);
  if (redirect) {
    responseHeaders.set('Location', redirect);
  }

  const encoder = new TextEncoder();
  const bodyBytes = body ? encoder.encode(body) : null;

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders,
    body: bodyBytes
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(bodyBytes);
            controller.close();
          },
        })
      : null,
  } as unknown as Response;
}

// Helper to create a mock fetch that returns specified responses in sequence
function mockFetchSequence(responses: Response[]): typeof fetch {
  let callCount = 0;
  return async () => {
    if (callCount >= responses.length) {
      throw new Error('Unexpected fetch call');
    }
    return responses[callCount++];
  };
}

describe('SafeFetcher', () => {
  it('fetches URL successfully', async () => {
    const fetcher = mockFetchSequence([
      mockResponse({ status: 200, body: '<html>Hello</html>', headers: { 'content-type': 'text/html' } }),
    ]);

    const result = await safeFetch('https://example.com', {
      timeoutMs: 5000,
      fetcher,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.body, '<html>Hello</html>');
    assert.equal(result.redirected, false);
  });

  it('rejects SSRF URL before making network call', async () => {
    let fetchCalled = false;
    const fetcher = async () => {
      fetchCalled = true;
      return mockResponse({ status: 200 });
    };

    await assert.rejects(
      () =>
        safeFetch('http://localhost', {
          timeoutMs: 5000,
          fetcher,
          urlSafety: { allowedSchemes: ['https'] },
        }),
      UrlSafetyError,
    );

    assert.equal(fetchCalled, false, 'fetch should not be called for unsafe URL');
  });

  it('handles redirects with re-validation', async () => {
    const fetcher = mockFetchSequence([
      mockResponse({ status: 301, redirect: 'https://example.com/new' }),
      mockResponse({ status: 200, body: 'redirected', headers: { 'content-type': 'text/html' } }),
    ]);

    const result = await safeFetch('https://example.com', {
      timeoutMs: 5000,
      fetcher,
    });

    assert.equal(result.ok, true);
    assert.equal(result.body, 'redirected');
    assert.equal(result.redirected, true);
    assert.equal(result.finalUrl, 'https://example.com/new');
  });

  it('rejects redirect to unsafe URL', async () => {
    const fetcher = mockFetchSequence([mockResponse({ status: 301, redirect: 'http://169.254.169.254/metadata' })]);

    await assert.rejects(
      () =>
        safeFetch('https://example.com', {
          timeoutMs: 5000,
          fetcher,
        }),
      UrlSafetyError,
    );
  });

  it('stops after max redirects', async () => {
    const fetcher = mockFetchSequence([
      mockResponse({ status: 301, redirect: 'https://example.com/redirect1' }),
      mockResponse({ status: 301, redirect: 'https://example.com/redirect2' }),
      mockResponse({ status: 301, redirect: 'https://example.com/redirect3' }),
      mockResponse({ status: 301, redirect: 'https://example.com/redirect4' }),
      mockResponse({ status: 200, body: 'final', headers: { 'content-type': 'text/html' } }),
    ]);

    const result = await safeFetch('https://example.com', {
      timeoutMs: 5000,
      maxRedirects: 3,
      fetcher,
    });

    // Should stop at 3 redirects and return the last response
    assert.equal(result.redirected, true);
  });

  it('truncates large responses', async () => {
    const largeBody = 'x'.repeat(2_000_000); // 2MB
    const fetcher = mockFetchSequence([
      mockResponse({ status: 200, body: largeBody, headers: { 'content-type': 'text/html' } }),
    ]);

    const result = await safeFetch('https://example.com', {
      timeoutMs: 5000,
      maxResponseBytes: 1_048_576, // 1MB
      fetcher,
    });

    // Body should be truncated
    assert.ok((result.body?.length ?? 0) < largeBody.length);
  });

  it('reads body for non-HTML responses', async () => {
    const fetcher = mockFetchSequence([
      mockResponse({ status: 200, body: 'plain text', headers: { 'content-type': 'text/plain' } }),
    ]);

    const result = await safeFetch('https://example.com', {
      timeoutMs: 5000,
      fetcher,
    });

    assert.equal(result.ok, true);
    assert.equal(result.body, 'plain text');
  });

  it('handles network errors', async () => {
    const fetcher = async () => {
      throw new Error('Network error');
    };

    await assert.rejects(
      () =>
        safeFetch('https://example.com', {
          timeoutMs: 5000,
          fetcher,
        }),
      UrlSafetyError,
    );
  });

  it('handles timeout errors', async () => {
    const fetcher = async () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    };

    await assert.rejects(
      () =>
        safeFetch('https://example.com', {
          timeoutMs: 5000,
          fetcher,
        }),
      UrlSafetyError,
    );
  });
});

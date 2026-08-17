import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpSocialDiscoveryProvider } from './http-social-discovery.provider.js';
import { EnrichmentTimeoutError, EnrichmentNetworkError } from '../../domain/errors/enrichment.errors.js';

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

describe('HttpSocialDiscoveryProvider', () => {
  const defaultOptions = {
    timeoutMs: 5000,
    userAgent: 'TestBot',
    robotsTxtCache: new Map(),
  };

  it('discovers 3 social profiles from website links', async () => {
    const html = `
      <html><body>
        <a href="https://facebook.com/mybusiness">Facebook</a>
        <a href="https://instagram.com/mybiz">Instagram</a>
        <a href="https://linkedin.com/company/mybusiness">LinkedIn</a>
      </body></html>
    `;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'My Business', timeoutMs: 5000 });

    assert.equal(result.profiles.length, 3);
    assert.ok(result.profiles.some((p) => p.platform === 'facebook' && p.handle === 'mybusiness'));
    assert.ok(result.profiles.some((p) => p.platform === 'instagram' && p.handle === 'mybiz'));
    assert.ok(result.profiles.some((p) => p.platform === 'linkedin' && p.handle === 'mybusiness'));
    assert.equal(result.provider, 'http-social-discovery');
  });

  it('returns empty array when no social links found', async () => {
    const html = '<html><body><p>No social links here</p></body></html>';
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles.length, 0);
  });

  it('deduplicates same profile from multiple links', async () => {
    const html = `
      <html><body>
        <a href="https://facebook.com/mybusiness">FB1</a>
        <a href="https://www.facebook.com/mybusiness">FB2</a>
        <a href="https://facebook.com/mybusiness/">FB3</a>
      </body></html>
    `;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    const fbProfiles = result.profiles.filter((p) => p.platform === 'facebook');
    assert.equal(fbProfiles.length, 1);
    assert.equal(fbProfiles[0].handle, 'mybusiness');
  });

  it('keeps highest confidence when deduplicating', async () => {
    const html = `
      <html><body>
        <div>
          <a href="https://twitter.com/mybiz">Twitter in body</a>
        </div>
        <footer>
          <a href="https://twitter.com/mybiz">Twitter in footer</a>
        </footer>
      </body></html>
    `;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    const twitter = result.profiles.find((p) => p.platform === 'twitter');
    assert.ok(twitter);
    assert.equal(twitter.confidence, 0.9);
  });

  it('assigns confidence based on footer placement', async () => {
    const html = `
      <html><body>
        <footer>
          <a href="https://facebook.com/mybiz">FB</a>
        </footer>
      </body></html>
    `;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].confidence, 0.9);
  });

  it('assigns confidence based on nav placement', async () => {
    const html = `
      <html><body>
        <nav>
          <a href="https://instagram.com/mybiz">IG</a>
        </nav>
      </body></html>
    `;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].confidence, 0.8);
  });

  it('assigns default body confidence for generic links', async () => {
    const html = `
      <html><body>
        <div class="content">
          <a href="https://tiktok.com/@mybiz">TikTok</a>
        </div>
      </body></html>
    `;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].confidence, 0.6);
  });

  it('extracts handles from linkedin /in/ path', async () => {
    const html = `<html><body><a href="https://linkedin.com/in/johndoe">LinkedIn</a></body></html>`;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].handle, 'johndoe');
    assert.equal(result.profiles[0].profileUrl, 'https://www.linkedin.com/in/johndoe');
  });

  it('extracts handles from youtube @handle path', async () => {
    const html = `<html><body><a href="https://youtube.com/@mychannel">YT</a></body></html>`;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].handle, 'mychannel');
    assert.equal(result.profiles[0].profileUrl, 'https://www.youtube.com/@mychannel');
  });

  it('extracts handles from tiktok @handle path', async () => {
    const html = `<html><body><a href="https://tiktok.com/@coolbrand">TT</a></body></html>`;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].handle, 'coolbrand');
    assert.equal(result.profiles[0].profileUrl, 'https://www.tiktok.com/@coolbrand');
  });

  it('normalizes www.facebook.com links', async () => {
    const html = `<html><body><a href="https://www.facebook.com/mybusiness">FB</a></body></html>`;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].profileUrl, 'https://www.facebook.com/mybusiness');
  });

  it('skips invalid URLs gracefully', async () => {
    const html = `
      <html><body>
        <a href="not-a-valid-url">Bad</a>
        <a href="https://facebook.com/valid">Good</a>
      </body></html>
    `;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles.length, 1);
    assert.equal(result.profiles[0].platform, 'facebook');
  });

  it('returns empty result on non-200 response', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse('', 404);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles.length, 0);
  });

  it('throws EnrichmentTimeoutError on timeout', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    await assert.rejects(
      () => provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 }),
      EnrichmentTimeoutError,
    );
  });

  it('throws EnrichmentNetworkError on network failure', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      throw new Error('ECONNREFUSED');
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    await assert.rejects(
      () => provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 }),
      EnrichmentNetworkError,
    );
  });

  it('throws RobotsTxtBlockedError when blocked', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nDisallow: /');
      return mockHtmlResponse('<html></html>');
    };

    const freshOptions = { ...defaultOptions, robotsTxtCache: new Map() };
    const provider = new HttpSocialDiscoveryProvider(freshOptions, fetcher);
    await assert.rejects(() => provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 }), {
      name: 'RobotsTxtBlockedError',
    });
  });

  it('handles facebook.com/pages/ URL path', async () => {
    const html = `<html><body><a href="https://facebook.com/pages/My-Business/123456">FB</a></body></html>`;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].handle, 'My-Business');
  });

  it('handles youtube.com/channel/ path', async () => {
    const html = `<html><body><a href="https://youtube.com/channel/UC1234567890">YT</a></body></html>`;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].handle, 'UC1234567890');
    assert.equal(result.profiles[0].profileUrl, 'https://www.youtube.com/channel/UC1234567890');
  });

  it('handles snapchat.com/add/ path', async () => {
    const html = `<html><body><a href="https://snapchat.com/add/cooluser">SC</a></body></html>`;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].handle, 'cooluser');
    assert.equal(result.profiles[0].profileUrl, 'https://www.snapchat.com/add/cooluser');
  });

  it('ignores non-social domains', async () => {
    const html = `
      <html><body>
        <a href="https://example.com/page">Internal</a>
        <a href="https://google.com/search">Google</a>
        <a href="https://facebook.com/mybiz">FB</a>
      </body></html>
    `;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles.length, 1);
    assert.equal(result.profiles[0].platform, 'facebook');
  });

  it('normalizes x.com to twitter platform', async () => {
    const html = `<html><body><a href="https://x.com/myhandle">X</a></body></html>`;
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse(html);
    };

    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });

    assert.equal(result.profiles[0].platform, 'twitter');
    assert.equal(result.profiles[0].handle, 'myhandle');
  });

  it('sets discoveredAt to current date', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('robots.txt')) return mockTextResponse('User-agent: *\nAllow: /');
      return mockHtmlResponse('<html></html>');
    };

    const before = Date.now();
    const provider = new HttpSocialDiscoveryProvider(defaultOptions, fetcher);
    const result = await provider.discover({ domain: 'example.com', companyName: 'Biz', timeoutMs: 5000 });
    const after = Date.now();

    assert.ok(result.discoveredAt.getTime() >= before);
    assert.ok(result.discoveredAt.getTime() <= after);
  });
});

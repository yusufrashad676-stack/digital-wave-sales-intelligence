import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkUrlSafety, assertUrlSafety } from './url-safety.util.js';
import { UrlSafetyError } from '../../modules/search/domain/errors/enrichment.errors.js';

// Stub DNS resolver that returns specified IPs
function dnsResolverReturning(ips: string[]) {
  return async () => ips;
}

// Stub DNS resolver that fails
function dnsResolverFailing() {
  return async () => {
    throw new Error('DNS resolution failed');
  };
}

describe('UrlSafetyGuard', () => {
  describe('checkUrlSafety', () => {
    it('allows valid HTTPS URL with public IP', async () => {
      const result = await checkUrlSafety('https://example.com', {
        dnsResolver: dnsResolverReturning(['93.184.216.34']),
      });
      assert.equal(result.safe, true);
    });

    it('rejects HTTP URL when only HTTPS allowed', async () => {
      const result = await checkUrlSafety('http://example.com', {
        dnsResolver: dnsResolverReturning(['93.184.216.34']),
      });
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('Scheme'));
    });

    it('rejects localhost', async () => {
      const result = await checkUrlSafety('https://localhost/path', {
        dnsResolver: dnsResolverReturning(['127.0.0.1']),
      });
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('reserved'));
    });

    it('rejects *.local domain', async () => {
      const result = await checkUrlSafety('https://myhost.local/path', {
        dnsResolver: dnsResolverReturning(['93.184.216.34']),
      });
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('reserved'));
    });

    it('rejects *.internal domain', async () => {
      const result = await checkUrlSafety('https://service.internal/api', {
        dnsResolver: dnsResolverReturning(['93.184.216.34']),
      });
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('reserved'));
    });

    it('rejects IPv4 loopback (127.x)', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['127.0.0.1']),
      });
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('blocked'));
    });

    it('rejects IPv4 private 10.x', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['10.0.0.1']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects IPv4 private 172.16.x', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['172.16.0.1']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects IPv4 private 192.168.x', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['192.168.1.1']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects IPv4 link-local 169.254.x', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['169.254.169.254']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects IPv4 documentation range 198.51.100.x', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['198.51.100.1']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects IPv4-mapped IPv6 (::ffff:127.0.0.1)', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['::ffff:127.0.0.1']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects IPv6 loopback (::1)', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['::1']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects IPv6 link-local (fe80::1)', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['fe80::1']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects IPv6 unique local (fd00::1)', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['fd00::1']),
      });
      assert.equal(result.safe, false);
    });

    it('rejects URL exceeding max length', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(3000);
      const result = await checkUrlSafety(longUrl);
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('length'));
    });

    it('rejects invalid URL format', async () => {
      const result = await checkUrlSafety('not-a-url');
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('Invalid URL'));
    });

    it('rejects DNS resolution failure', async () => {
      const result = await checkUrlSafety('https://nonexistent.example', {
        dnsResolver: dnsResolverFailing(),
      });
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('DNS resolution failed'));
    });

    it('rejects DNS resolution returning no IPs', async () => {
      const result = await checkUrlSafety('https://nonexistent.example', {
        dnsResolver: dnsResolverReturning([]),
      });
      assert.equal(result.safe, false);
      assert.ok(result.reason?.includes('no results'));
    });

    it('rejects when any resolved IP is private', async () => {
      const result = await checkUrlSafety('https://evil.com', {
        dnsResolver: dnsResolverReturning(['93.184.216.34', '192.168.1.1']),
      });
      assert.equal(result.safe, false);
    });
  });

  describe('assertUrlSafety', () => {
    it('throws UrlSafetyError for unsafe URL', async () => {
      await assert.rejects(
        () =>
          assertUrlSafety('http://localhost', {
            dnsResolver: dnsResolverReturning(['127.0.0.1']),
          }),
        UrlSafetyError,
      );
    });

    it('does not throw for safe URL', async () => {
      await assertUrlSafety('https://example.com', {
        dnsResolver: dnsResolverReturning(['93.184.216.34']),
      });
    });
  });
});

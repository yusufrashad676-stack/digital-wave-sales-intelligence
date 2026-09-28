import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkUrlSafety } from './url-safety.util.js';

describe('UrlSafety — R3 SSRF guardrails unchanged', () => {
  it('N: loopback and private IP literals stay blocked', async () => {
    assert.equal((await checkUrlSafety('https://127.0.0.1')).safe, false);
    assert.equal((await checkUrlSafety('https://localhost')).safe, false);
    assert.equal((await checkUrlSafety('https://192.168.0.1')).safe, false);
    assert.equal((await checkUrlSafety('https://10.0.0.1')).safe, false);
  });

  it('N: documentation/ranges used by the providers stay blocked', async () => {
    assert.equal((await checkUrlSafety('https://198.51.100.1')).safe, false);
    assert.equal((await checkUrlSafety('https://203.0.113.1')).safe, false);
  });

  it('N: non-https schemes stay rejected regardless of host', async () => {
    assert.equal((await checkUrlSafety('file:///etc/passwd')).safe, false);
    assert.equal((await checkUrlSafety('http://example.com')).safe, false);
    assert.equal((await checkUrlSafety('ftp://example.com')).safe, false);
  });
});

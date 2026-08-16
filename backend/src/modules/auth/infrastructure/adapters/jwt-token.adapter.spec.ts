import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { JwtTokenAdapter } from './jwt-token.adapter.js';

const ACCESS_SECRET = 'a'.repeat(40);
const REFRESH_SECRET = 'b'.repeat(40);

function makeAdapter(): JwtTokenAdapter {
  return new JwtTokenAdapter(
    new JwtService({}),
    new ConfigService({
      auth: {
        jwt: {
          accessSecret: ACCESS_SECRET,
          refreshSecret: REFRESH_SECRET,
          accessTtlSeconds: 900,
          refreshTtlSeconds: 2592000,
          algorithm: 'HS256',
        },
      },
    }),
  );
}

describe('JwtTokenAdapter', () => {
  it('signs and verifies an access token round-trip', async () => {
    const adapter = makeAdapter();
    const token = await adapter.signAccessToken({ sub: 'user-1', roles: ['GUEST'], type: 'access' });

    const claims = await adapter.verifyAccessToken(token);

    assert.equal(claims.sub, 'user-1');
    assert.deepEqual(claims.roles, ['GUEST']);
    assert.equal(claims.type, 'access');
  });

  it('signs a refresh token with a jti and verifies it', async () => {
    const adapter = makeAdapter();
    const signed = await adapter.signRefreshToken({ sub: 'user-1', familyId: 'family-1', type: 'refresh' });

    assert.equal(typeof signed.jti, 'string');
    assert.equal(signed.jti.length > 0, true);
    const claims = await adapter.verifyRefreshToken(signed.token);
    assert.equal(claims.sub, 'user-1');
    assert.equal(claims.familyId, 'family-1');
  });

  it('rejects an access token verified against a different secret', async () => {
    const adapter = makeAdapter();
    const token = await adapter.signAccessToken({ sub: 'user-1', roles: [], type: 'access' });

    const other = new JwtTokenAdapter(
      new JwtService({}),
      new ConfigService({
        auth: {
          jwt: {
            accessSecret: 'c'.repeat(40),
            refreshSecret: REFRESH_SECRET,
            accessTtlSeconds: 900,
            refreshTtlSeconds: 2592000,
            algorithm: 'HS256',
          },
        },
      }),
    );

    await assert.rejects(() => other.verifyAccessToken(token), UnauthorizedException);
  });

  it('rejects a refresh token presented to the access verifier', async () => {
    const adapter = makeAdapter();
    const signed = await adapter.signRefreshToken({ sub: 'user-1', familyId: 'family-1', type: 'refresh' });

    await assert.rejects(() => adapter.verifyAccessToken(signed.token), UnauthorizedException);
  });

  it('rejects a tampered token', async () => {
    const adapter = makeAdapter();
    const token = await adapter.signAccessToken({ sub: 'user-1', roles: [], type: 'access' });

    await assert.rejects(() => adapter.verifyAccessToken(`${token.slice(0, -1)}x`), UnauthorizedException);
  });

  it('rejects an expired access token', async () => {
    const expiredAdapter = new JwtTokenAdapter(
      new JwtService({}),
      new ConfigService({
        auth: {
          jwt: {
            accessSecret: ACCESS_SECRET,
            refreshSecret: REFRESH_SECRET,
            accessTtlSeconds: 1,
            refreshTtlSeconds: 2592000,
            algorithm: 'HS256',
          },
        },
      }),
    );
    const token = await expiredAdapter.signAccessToken({ sub: 'user-1', roles: ['GUEST'], type: 'access' });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await assert.rejects(() => expiredAdapter.verifyAccessToken(token), UnauthorizedException);
  });

  it('rejects an expired refresh token', async () => {
    const expiredAdapter = new JwtTokenAdapter(
      new JwtService({}),
      new ConfigService({
        auth: {
          jwt: {
            accessSecret: ACCESS_SECRET,
            refreshSecret: REFRESH_SECRET,
            accessTtlSeconds: 900,
            refreshTtlSeconds: 1,
            algorithm: 'HS256',
          },
        },
      }),
    );
    const signed = await expiredAdapter.signRefreshToken({ sub: 'user-1', familyId: 'f1', type: 'refresh' });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await assert.rejects(() => expiredAdapter.verifyRefreshToken(signed.token), UnauthorizedException);
  });

  it('rejects a malformed (non-JWT) token', async () => {
    const adapter = makeAdapter();

    await assert.rejects(() => adapter.verifyAccessToken('not-a-jwt-token'), UnauthorizedException);
    await assert.rejects(() => adapter.verifyRefreshToken('not-a-jwt-token'), UnauthorizedException);
    await assert.rejects(() => adapter.verifyAccessToken(''), UnauthorizedException);
    await assert.rejects(
      () => adapter.verifyAccessToken('eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.'),
      UnauthorizedException,
    );
  });

  it('hashes refresh tokens deterministically', () => {
    const adapter = makeAdapter();
    const first = adapter.hashRefreshToken('refresh.token');
    const second = adapter.hashRefreshToken('refresh.token');
    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.notEqual(first, adapter.hashRefreshToken('other.token'));
  });

  it('generates unique family ids', () => {
    const adapter = makeAdapter();
    assert.notEqual(adapter.generateFamilyId(), adapter.generateFamilyId());
  });
});

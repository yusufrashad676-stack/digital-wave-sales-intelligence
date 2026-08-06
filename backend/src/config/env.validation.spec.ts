import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateEnv } from './env.validation.js';

const ACCESS_SECRET = 'a'.repeat(40);
const REFRESH_SECRET = 'b'.repeat(40);

const BASE_ENV = {
  DIRECT_DATABASE_URL: 'postgres://localhost:5432/db',
  JWT_SECRET: ACCESS_SECRET,
  JWT_REFRESH_SECRET: REFRESH_SECRET,
};

describe('validateEnv', () => {
  it('applies defaults for optional values', () => {
    const config = validateEnv(BASE_ENV);
    assert.equal(config.app.nodeEnv, 'development');
    assert.equal(config.app.port, 3000);
    assert.equal(config.throttle.ttlSeconds, 60);
    assert.equal(config.throttle.limit, 100);
    assert.deepEqual(config.cors.origins, ['http://localhost:5173', 'http://localhost:3000']);
  });

  it('applies JWT defaults', () => {
    const config = validateEnv(BASE_ENV);
    assert.equal(config.auth.jwt.accessTtlSeconds, 900);
    assert.equal(config.auth.jwt.refreshTtlSeconds, 2592000);
    assert.equal(config.auth.jwt.algorithm, 'HS256');
    assert.equal(config.auth.throttle.limit, 10);
    assert.equal(config.auth.throttle.ttlSeconds, 60);
  });

  it('rejects a missing DIRECT_DATABASE_URL', () => {
    assert.throws(
      () => validateEnv({ JWT_SECRET: ACCESS_SECRET, JWT_REFRESH_SECRET: REFRESH_SECRET }),
      /DIRECT_DATABASE_URL is required/,
    );
  });

  it('rejects a missing or short JWT_SECRET', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_SECRET: undefined }), /JWT_SECRET/);
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_SECRET: 'short' }), /JWT_SECRET/);
  });

  it('rejects a missing or short JWT_REFRESH_SECRET', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_REFRESH_SECRET: undefined }), /JWT_REFRESH_SECRET/);
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_REFRESH_SECRET: 'short' }), /JWT_REFRESH_SECRET/);
  });

  it('rejects an unsupported JWT_ALGORITHM', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_ALGORITHM: 'none' }), /JWT_ALGORITHM/);
  });

  it('rejects out-of-range JWT TTLs', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_ACCESS_TTL: '0' }), /JWT_ACCESS_TTL/);
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_REFRESH_TTL: '10' }), /JWT_REFRESH_TTL/);
  });

  it('parses JWT configuration', () => {
    const config = validateEnv({
      ...BASE_ENV,
      JWT_ACCESS_TTL: '300',
      JWT_REFRESH_TTL: '604800',
      JWT_ALGORITHM: 'HS512',
      AUTH_THROTTLE_TTL_SECONDS: '30',
      AUTH_THROTTLE_LIMIT: '5',
    });
    assert.equal(config.auth.jwt.accessTtlSeconds, 300);
    assert.equal(config.auth.jwt.refreshTtlSeconds, 604800);
    assert.equal(config.auth.jwt.algorithm, 'HS512');
    assert.equal(config.auth.throttle.limit, 5);
    assert.equal(config.auth.throttle.ttlSeconds, 30);
  });

  it('rejects an invalid APP_PORT', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, APP_PORT: 'abc' }), /APP_PORT/);
  });

  it('rejects a zero throttle limit', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, THROTTLE_LIMIT: '0' }), /THROTTLE_LIMIT/);
  });

  it('parses CORS_ORIGINS into a list', () => {
    const config = validateEnv({
      ...BASE_ENV,
      CORS_ORIGINS: 'https://app.example.com, https://admin.example.com',
    });
    assert.deepEqual(config.cors.origins, ['https://app.example.com', 'https://admin.example.com']);
  });

  it('defaults to same-origin only in production', () => {
    const config = validateEnv({ ...BASE_ENV, NODE_ENV: 'production' });
    assert.deepEqual(config.cors.origins, []);
  });

  it('parses numeric values', () => {
    const config = validateEnv({
      ...BASE_ENV,
      APP_PORT: '8080',
      THROTTLE_TTL_SECONDS: '5',
      THROTTLE_LIMIT: '20',
    });
    assert.equal(config.app.port, 8080);
    assert.equal(config.throttle.ttlSeconds, 5);
    assert.equal(config.throttle.limit, 20);
  });
});

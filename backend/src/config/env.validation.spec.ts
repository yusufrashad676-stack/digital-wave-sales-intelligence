import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('applies defaults for optional values', () => {
    const config = validateEnv({ DIRECT_DATABASE_URL: 'postgres://localhost:5432/db' });
    assert.equal(config.app.nodeEnv, 'development');
    assert.equal(config.app.port, 3000);
    assert.equal(config.throttle.ttlSeconds, 60);
    assert.equal(config.throttle.limit, 100);
    assert.deepEqual(config.cors.origins, ['http://localhost:5173', 'http://localhost:3000']);
  });

  it('rejects a missing DIRECT_DATABASE_URL', () => {
    assert.throws(() => validateEnv({}), /DIRECT_DATABASE_URL is required/);
  });

  it('rejects an invalid APP_PORT', () => {
    assert.throws(
      () => validateEnv({ DIRECT_DATABASE_URL: 'postgres://localhost:5432/db', APP_PORT: 'abc' }),
      /APP_PORT/,
    );
  });

  it('rejects a zero throttle limit', () => {
    assert.throws(
      () => validateEnv({ DIRECT_DATABASE_URL: 'postgres://localhost:5432/db', THROTTLE_LIMIT: '0' }),
      /THROTTLE_LIMIT/,
    );
  });

  it('parses CORS_ORIGINS into a list', () => {
    const config = validateEnv({
      DIRECT_DATABASE_URL: 'postgres://localhost:5432/db',
      CORS_ORIGINS: 'https://app.example.com, https://admin.example.com',
    });
    assert.deepEqual(config.cors.origins, ['https://app.example.com', 'https://admin.example.com']);
  });

  it('defaults to same-origin only in production', () => {
    const config = validateEnv({
      DIRECT_DATABASE_URL: 'postgres://localhost:5432/db',
      NODE_ENV: 'production',
    });
    assert.deepEqual(config.cors.origins, []);
  });

  it('parses numeric values', () => {
    const config = validateEnv({
      DIRECT_DATABASE_URL: 'postgres://localhost:5432/db',
      APP_PORT: '8080',
      THROTTLE_TTL_SECONDS: '5',
      THROTTLE_LIMIT: '20',
    });
    assert.equal(config.app.port, 8080);
    assert.equal(config.throttle.ttlSeconds, 5);
    assert.equal(config.throttle.limit, 20);
  });
});

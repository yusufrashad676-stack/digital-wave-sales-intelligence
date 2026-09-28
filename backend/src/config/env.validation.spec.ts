import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateEnv } from './env.validation.js';

const ACCESS_SECRET = 'a'.repeat(40);
const REFRESH_SECRET = 'b'.repeat(40);

const BASE_ENV = {
  DIRECT_DATABASE_URL: 'postgres://localhost:5432/db',
  JWT_SECRET: ACCESS_SECRET,
  JWT_REFRESH_SECRET: REFRESH_SECRET,
  GOOGLE_MAPS_API_KEY: 'AIza-test-key',
};

function withoutGoogleKey(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...BASE_ENV, GOOGLE_MAPS_API_KEY: undefined, ...overrides };
}

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

  it('never selects the mock provider when SEARCH_PROVIDER and the Google key are both omitted', () => {
    assert.throws(() => validateEnv(withoutGoogleKey()), /GOOGLE_MAPS_API_KEY is required/);
  });

  it('rejects google-places without an API key', () => {
    assert.throws(
      () => validateEnv(withoutGoogleKey({ SEARCH_PROVIDER: 'google-places' })),
      /GOOGLE_MAPS_API_KEY is required/,
    );
  });

  it('treats a blank Google key as missing rather than falling back to mock', () => {
    assert.throws(
      () => validateEnv(withoutGoogleKey({ GOOGLE_MAPS_API_KEY: '   ' })),
      /GOOGLE_MAPS_API_KEY is required/,
    );
  });

  it('selects google-places when a Google key is present', () => {
    const config = validateEnv(BASE_ENV);
    assert.equal(config.search.provider, 'google-places');
    assert.equal(config.search.googleMapsApiKey, 'AIza-test-key');
  });

  it('defaults SEARCH_PROVIDER to google-places when the Google key is present', () => {
    const config = validateEnv(BASE_ENV);
    assert.equal(config.search.provider, 'google-places');
    assert.equal(config.search.maxResults, 20);
    assert.equal(config.search.googleTimeoutMs, 5000);
  });

  it('forces the mock provider when SEARCH_PROVIDER=mock and a key is present', () => {
    const config = validateEnv({ ...BASE_ENV, SEARCH_PROVIDER: 'mock' });
    assert.equal(config.search.provider, 'mock');
  });

  it('allows SEARCH_PROVIDER=mock when NODE_ENV=development', () => {
    const config = validateEnv(withoutGoogleKey({ SEARCH_PROVIDER: 'mock', NODE_ENV: 'development' }));
    assert.equal(config.search.provider, 'mock');
  });

  it('allows SEARCH_PROVIDER=mock when NODE_ENV=test', () => {
    const config = validateEnv(withoutGoogleKey({ SEARCH_PROVIDER: 'mock', NODE_ENV: 'test' }));
    assert.equal(config.search.provider, 'mock');
  });

  it('rejects SEARCH_PROVIDER=mock when NODE_ENV=production', () => {
    assert.throws(
      () => validateEnv(withoutGoogleKey({ SEARCH_PROVIDER: 'mock', NODE_ENV: 'production' })),
      /SEARCH_PROVIDER=mock is not allowed in production/,
    );
  });

  it('rejects SEARCH_PROVIDER=mock in production even when a Google key is present', () => {
    assert.throws(
      () => validateEnv({ ...BASE_ENV, SEARCH_PROVIDER: 'mock', NODE_ENV: 'production' }),
      /SEARCH_PROVIDER=mock is not allowed in production/,
    );
  });

  it('allows the real provider in production when the Google key is present', () => {
    const config = validateEnv({ ...BASE_ENV, NODE_ENV: 'production' });
    assert.equal(config.search.provider, 'google-places');
  });

  it('rejects production without a Google key instead of degrading to mock', () => {
    assert.throws(() => validateEnv(withoutGoogleKey({ NODE_ENV: 'production' })), /GOOGLE_MAPS_API_KEY is required/);
  });

  it('does not leak secret values in configuration errors', () => {
    try {
      validateEnv({ ...BASE_ENV, NODE_ENV: 'production', SEARCH_PROVIDER: 'mock' });
      assert.fail('expected validation to reject mock in production');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(!message.includes('AIza-test-key'));
      assert.ok(!message.includes(ACCESS_SECRET));
      assert.ok(!message.includes(REFRESH_SECRET));
    }
  });

  it('parses SEARCH_PROVIDER case-insensitively', () => {
    const config = validateEnv({ ...BASE_ENV, SEARCH_PROVIDER: 'Google-Places' });
    assert.equal(config.search.provider, 'google-places');
  });

  it('rejects an unsupported SEARCH_PROVIDER', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, SEARCH_PROVIDER: 'bing' }), /SEARCH_PROVIDER/);
  });

  it('rejects an unrecognised NODE_ENV instead of silently treating it as development', () => {
    assert.throws(
      () => validateEnv({ ...BASE_ENV, SEARCH_PROVIDER: 'mock', NODE_ENV: 'prod' }),
      /NODE_ENV must be one of/,
    );
    assert.throws(
      () => validateEnv({ ...BASE_ENV, SEARCH_PROVIDER: 'mock', NODE_ENV: 'production ' }),
      /NODE_ENV must be one of/,
    );
  });

  it('rejects out-of-range SEARCH_MAX_RESULTS', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, SEARCH_MAX_RESULTS: '0' }), /SEARCH_MAX_RESULTS/);
    assert.throws(() => validateEnv({ ...BASE_ENV, SEARCH_MAX_RESULTS: '21' }), /SEARCH_MAX_RESULTS/);
  });

  it('rejects a non-positive SEARCH_GOOGLE_TIMEOUT_MS', () => {
    assert.throws(() => validateEnv({ ...BASE_ENV, SEARCH_GOOGLE_TIMEOUT_MS: '0' }), /SEARCH_GOOGLE_TIMEOUT_MS/);
  });

  it('rejects identical JWT secrets', () => {
    const sameSecret = 'a'.repeat(40);
    assert.throws(
      () => validateEnv({ ...BASE_ENV, JWT_SECRET: sameSecret, JWT_REFRESH_SECRET: sameSecret }),
      /must be distinct/,
    );
  });

  it('rejects placeholder patterns in JWT_SECRET', () => {
    assert.throws(
      () => validateEnv({ ...BASE_ENV, JWT_SECRET: 'REPLACE_WITH_RANDOM_ACCESS_SECRET_AT_LEAST_32' }),
      /placeholder/,
    );
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_SECRET: 'change-me-please-change-me-now!!' }), /placeholder/);
    assert.throws(() => validateEnv({ ...BASE_ENV, JWT_SECRET: 'passwordpasswordpasswordpassword!' }), /placeholder/);
  });

  it('rejects placeholder patterns in JWT_REFRESH_SECRET', () => {
    assert.throws(
      () => validateEnv({ ...BASE_ENV, JWT_REFRESH_SECRET: 'REPLACE_WITH_RANDOM_REFRESH_SECRET_AT_LEAST' }),
      /placeholder/,
    );
  });

  it('accepts strong random-looking secrets', () => {
    const config = validateEnv({
      ...BASE_ENV,
      JWT_SECRET: 'xK9#mP2$vL5@nQ8!rT3&wZ6*yJ1!abcD',
      JWT_REFRESH_SECRET: 'fH4#cD7%gB0^kJ2*sM5(eW8!qR1!xyzZ',
    });
    assert.equal(config.auth.jwt.accessSecret, 'xK9#mP2$vL5@nQ8!rT3&wZ6*yJ1!abcD');
    assert.equal(config.auth.jwt.refreshSecret, 'fH4#cD7%gB0^kJ2*sM5(eW8!qR1!xyzZ');
  });

  it('parses search tuning values', () => {
    const config = validateEnv({
      ...BASE_ENV,
      GOOGLE_MAPS_API_KEY: 'AIza-test',
      SEARCH_MAX_RESULTS: '10',
      SEARCH_GOOGLE_TIMEOUT_MS: '3000',
    });
    assert.equal(config.search.provider, 'google-places');
    assert.equal(config.search.maxResults, 10);
    assert.equal(config.search.googleTimeoutMs, 3000);
  });
});

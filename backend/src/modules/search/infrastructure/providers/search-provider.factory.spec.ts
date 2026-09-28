import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AppConfig, NodeEnv } from '../../../../config/configuration.js';
import { validateEnv } from '../../../../config/env.validation.js';
import { GooglePlacesProvider } from './google-places.provider.js';
import { MockSearchProvider } from './mock-search.provider.js';
import { createSearchProvider } from './search-provider.factory.js';

function searchConfig(overrides: Partial<AppConfig['search']> = {}): AppConfig['search'] {
  return {
    provider: 'mock',
    maxResults: 20,
    googleTimeoutMs: 5000,
    ...overrides,
  };
}

describe('createSearchProvider', () => {
  it('returns the mock provider when mock is selected explicitly', () => {
    const provider = createSearchProvider(searchConfig({ provider: 'mock' }), 'development');
    assert.ok(provider instanceof MockSearchProvider);
  });

  it('returns the mock provider when mock is selected explicitly in test env', () => {
    const provider = createSearchProvider(searchConfig({ provider: 'mock' }), 'test');
    assert.ok(provider instanceof MockSearchProvider);
  });

  it('returns the Google provider when google-places is selected with a key', () => {
    const provider = createSearchProvider(
      searchConfig({ provider: 'google-places', googleMapsApiKey: 'AIza-test' }),
      'development',
    );
    assert.ok(provider instanceof GooglePlacesProvider);
    assert.equal(provider.providerId, 'google-places');
  });

  it('throws when google-places is selected without an API key', () => {
    assert.throws(
      () => createSearchProvider(searchConfig({ provider: 'google-places' }), 'development'),
      /GOOGLE_MAPS_API_KEY/,
    );
  });

  it('refuses the mock provider in production', () => {
    assert.throws(
      () => createSearchProvider(searchConfig({ provider: 'mock' }), 'production'),
      /SEARCH_PROVIDER=mock is not allowed in production/,
    );
  });

  it('refuses the mock provider in production even when a Google key is present', () => {
    assert.throws(
      () => createSearchProvider(searchConfig({ provider: 'mock', googleMapsApiKey: 'AIza-test' }), 'production'),
      /SEARCH_PROVIDER=mock is not allowed in production/,
    );
  });

  it('throws instead of falling back to mock for an unknown provider', () => {
    assert.throws(
      () => createSearchProvider(searchConfig({ provider: 'bing' as AppConfig['search']['provider'] }), 'development'),
      /Unsupported SEARCH_PROVIDER/,
    );
  });

  it('never returns the mock provider when Google credentials are absent', () => {
    for (const nodeEnv of ['development', 'test', 'production'] as const satisfies readonly NodeEnv[]) {
      let constructed: unknown;
      try {
        constructed = createSearchProvider(searchConfig({ provider: 'google-places' }), nodeEnv);
      } catch {
        constructed = undefined;
      }
      assert.ok(
        !(constructed instanceof MockSearchProvider),
        `google-places without a key must never yield MockSearchProvider (NODE_ENV=${nodeEnv})`,
      );
    }
  });
});

describe('environment to provider selection', () => {
  const ENV_WITHOUT_GOOGLE = {
    DIRECT_DATABASE_URL: 'postgres://localhost:5432/db',
    JWT_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
  };

  function build(env: Record<string, unknown>): { search: AppConfig['search']; nodeEnv: NodeEnv } {
    const config = validateEnv(env);
    return { search: config.search, nodeEnv: config.app.nodeEnv };
  }

  it('refuses to boot an environment with no Google credentials instead of serving mock data', () => {
    for (const nodeEnv of ['development', 'test', 'production']) {
      assert.throws(
        () => build({ ...ENV_WITHOUT_GOOGLE, NODE_ENV: nodeEnv }),
        /GOOGLE_MAPS_API_KEY is required/,
        `NODE_ENV=${nodeEnv} must not resolve to a bootable mock configuration`,
      );
    }
  });

  it('resolves a bootable environment to the real provider when a key is configured', () => {
    const { search, nodeEnv } = build({ ...ENV_WITHOUT_GOOGLE, GOOGLE_MAPS_API_KEY: 'AIza-test-key' });
    assert.ok(createSearchProvider(search, nodeEnv) instanceof GooglePlacesProvider);
  });

  it('resolves the mock provider only for an explicit non-production request', () => {
    for (const nodeEnv of ['development', 'test'] as const) {
      const { search, nodeEnv: resolved } = build({
        ...ENV_WITHOUT_GOOGLE,
        NODE_ENV: nodeEnv,
        SEARCH_PROVIDER: 'mock',
      });
      assert.equal(resolved, nodeEnv);
      assert.ok(createSearchProvider(search, resolved) instanceof MockSearchProvider);
    }
    assert.throws(
      () => build({ ...ENV_WITHOUT_GOOGLE, NODE_ENV: 'production', SEARCH_PROVIDER: 'mock' }),
      /SEARCH_PROVIDER=mock is not allowed in production/,
    );
  });
});

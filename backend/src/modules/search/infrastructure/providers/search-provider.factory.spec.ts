import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AppConfig } from '../../../../config/configuration.js';
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
  it('returns the mock provider by default', () => {
    const provider = createSearchProvider(searchConfig({ provider: 'mock' }));
    assert.ok(provider instanceof MockSearchProvider);
  });

  it('returns the Google provider when google-places is selected with a key', () => {
    const provider = createSearchProvider(searchConfig({ provider: 'google-places', googleMapsApiKey: 'AIza-test' }));
    assert.ok(provider instanceof GooglePlacesProvider);
    assert.equal(provider.providerId, 'google-places');
  });

  it('throws when google-places is selected without an API key', () => {
    assert.throws(() => createSearchProvider(searchConfig({ provider: 'google-places' })), /GOOGLE_MAPS_API_KEY/);
  });
});

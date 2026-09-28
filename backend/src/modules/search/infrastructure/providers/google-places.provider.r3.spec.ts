import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SearchQuery } from '../../domain/entities/search-query.js';
import { GooglePlacesProvider } from './google-places.provider.js';

const OPTIONS = { maxResults: 20, timeoutMs: 5000 };

function engineWith(payload: unknown) {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input, init });
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  const provider = new GooglePlacesProvider('AIza-test-key', OPTIONS, fetcher);
  return { provider, calls };
}

describe('GooglePlacesProvider — R3 coordinates', () => {
  const PLACE = {
    id: 'ChIJ-test',
    displayName: { text: 'Test Clinic' },
    formattedAddress: 'Cairo',
    location: { latitude: 30.0166, longitude: 31.4968 },
    types: ['doctor'],
  };

  it('H: provider-supplied location reaches ProviderSearchResult', async () => {
    const { provider } = engineWith({ places: [PLACE] });
    const result = await provider.search(new SearchQuery('عيادات'));

    assert.equal(result.results[0].latitude, 30.0166);
    assert.equal(result.results[0].longitude, 31.4968);
  });

  it('H2: requests places.location in the field mask', async () => {
    const { provider, calls } = engineWith({ places: [] });
    await provider.search(new SearchQuery('عيادات'));
    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.ok(headers['X-Goog-FieldMask'].includes('places.location'));
  });

  it('I: missing location maps to null (never fabricated)', async () => {
    const { provider } = engineWith({ places: [{ id: 'no-loc', displayName: { text: 'X' } }] });
    const result = await provider.search(new SearchQuery('عيادات'));

    assert.equal(result.results[0].latitude, undefined);
    assert.equal(result.results[0].longitude, undefined);
  });
});

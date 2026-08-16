import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '../../../../common/exceptions/service-unavailable.exception.js';
import { SearchQuery } from '../../domain/entities/search-query.js';
import { GooglePlacesProvider } from './google-places.provider.js';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,' +
  'places.rating,places.userRatingCount,places.googleMapsUri,places.types';

const OPTIONS = { maxResults: 20, timeoutMs: 5000 };
const API_KEY = 'AIza-test-key';

interface CapturedCall {
  input: string | URL | Request;
  init?: RequestInit;
}

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as unknown as Response;
}

function fetcherReturning(payload: unknown, status = 200): { fetcher: typeof fetch; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input, init });
    return response(payload, status);
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function providerWith(payload: unknown, status = 200, apiKey = API_KEY) {
  const { fetcher, calls } = fetcherReturning(payload, status);
  const provider = new GooglePlacesProvider(apiKey, OPTIONS, fetcher);
  return { provider, calls };
}

const SAMPLE_PLACE = {
  id: 'ChIJ-test-place-001',
  displayName: { text: 'عيادة د. أحمد لطب الأسنان', languageCode: 'ar' },
  formattedAddress: 'القاهرة الجديدة، التجمع الخامس',
  nationalPhoneNumber: '+20 100 123 4567',
  websiteUri: 'https://www.example-dental-ahmed.com',
  rating: 4.6,
  userRatingCount: 128,
  googleMapsUri: 'https://maps.google.com/?cid=123456789',
  types: ['dentist', 'doctor', 'health'],
};

describe('GooglePlacesProvider', () => {
  it('exposes its provider id and capabilities', () => {
    const { provider, calls } = providerWith({ places: [] });
    assert.equal(provider.providerId, 'google-places');
    assert.deepEqual(provider.capabilities, ['search']);
    assert.equal(calls.length, 0);
  });

  it('calls the Google Places Text Search (New) endpoint', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('عيادات'));
    assert.equal(String(calls[0]?.input), ENDPOINT);
  });

  it('uses the POST HTTP method', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('عيادات'));
    assert.equal(calls[0]?.init?.method, 'POST');
  });

  it('sends the API key through the X-Goog-Api-Key header', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('عيادات'));
    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers['X-Goog-Api-Key'], API_KEY);
  });

  it('sends the field mask through the X-Goog-FieldMask header', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('عيادات'));
    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers['X-Goog-FieldMask'], FIELD_MASK);
  });

  it('sets a timeout signal on the request', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('عيادات'));
    assert.ok(calls[0]?.init?.signal instanceof AbortSignal);
  });

  it('maps the free-text query into textQuery', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('عيادات في التجمع'));
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(body.textQuery, 'عيادات في التجمع');
  });

  it('appends the governorate filter as location text in the query', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('عيادات', { governorate: 'Cairo' }));
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(body.textQuery, 'عيادات, Cairo');
  });

  it('maps a clean category to a Google includedType', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('بحث', { category: 'restaurant' }));
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(body.includedType, 'restaurant');
  });

  it('maps clinic and dental-clinic to doctor and dentist', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('بحث', { category: 'clinic' }));
    const clinicBody = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(clinicBody.includedType, 'doctor');
    await provider.search(new SearchQuery('بحث', { category: 'dental-clinic' }));
    const dentalBody = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
    assert.equal(dentalBody.includedType, 'dentist');
  });

  it('omits includedType for categories without a clean Google type', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('بحث', { category: 'home-services' }));
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(body.includedType, undefined);
  });

  it('maps minRating into the request and omits it when absent', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('بحث', { minRating: 4.5 }));
    const withRating = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(withRating.minRating, 4.5);
    await provider.search(new SearchQuery('بحث'));
    const withoutRating = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
    assert.equal(withoutRating.minRating, undefined);
  });

  it('sends a conservative page size', async () => {
    const { provider, calls } = providerWith({ places: [] });
    await provider.search(new SearchQuery('بحث'));
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(body.pageSize, 20);
  });

  it('maps a Google place into a ProviderSearchResult', async () => {
    const { provider } = providerWith({ places: [SAMPLE_PLACE] });
    const resultSet = await provider.search(new SearchQuery('أسنان'));
    assert.equal(resultSet.providerId, 'google-places');
    assert.equal(resultSet.results.length, 1);
    const result = resultSet.results[0];
    assert.equal(result?.providerRecordId, 'ChIJ-test-place-001');
    assert.equal(result?.companyName, 'عيادة د. أحمد لطب الأسنان');
    assert.equal(result?.address, 'القاهرة الجديدة، التجمع الخامس');
    assert.equal(result?.phone, '+20 100 123 4567');
    assert.equal(result?.website, 'https://www.example-dental-ahmed.com');
    assert.equal(result?.rating, 4.6);
    assert.equal(result?.ratingCount, 128);
    assert.equal(result?.sourceUrl, 'https://maps.google.com/?cid=123456789');
    assert.equal(result?.category, 'dental-clinic');
    assert.equal(result?.verificationStatus, undefined);
  });

  it('maps Google types to the highest-priority internal category', async () => {
    const { provider } = providerWith({
      places: [{ id: 'p2', displayName: { text: 'X' }, types: ['doctor', 'dentist', 'health'] }],
    });
    const resultSet = await provider.search(new SearchQuery('بحث'));
    assert.equal(resultSet.results[0]?.category, 'dental-clinic');
  });

  it('leaves missing Google fields as undefined', async () => {
    const { provider } = providerWith({ places: [{ id: 'p-only-id' }] });
    const resultSet = await provider.search(new SearchQuery('بحث'));
    const result = resultSet.results[0];
    assert.equal(result?.providerRecordId, 'p-only-id');
    assert.equal(result?.companyName, '');
    assert.equal(result?.category, undefined);
    assert.equal(result?.address, undefined);
    assert.equal(result?.phone, undefined);
    assert.equal(result?.website, undefined);
    assert.equal(result?.rating, undefined);
    assert.equal(result?.sourceUrl, undefined);
  });

  it('returns an empty result set for an empty Google response', async () => {
    const { provider } = providerWith({ places: [] });
    const resultSet = await provider.search(new SearchQuery('لا يوجد'));
    assert.deepEqual(resultSet.results, []);
  });

  it('rejects Google 4xx errors', async () => {
    const { provider } = providerWith({ error: { message: 'invalid' } }, 400);
    await assert.rejects(() => provider.search(new SearchQuery('بحث')), ServiceUnavailableException);
  });

  it('rejects Google rate limiting (429)', async () => {
    const { provider } = providerWith({ error: { message: 'exhausted' } }, 429);
    await assert.rejects(() => provider.search(new SearchQuery('بحث')), ServiceUnavailableException);
  });

  it('rejects Google 5xx errors', async () => {
    const { provider } = providerWith({ error: { message: 'boom' } }, 500);
    await assert.rejects(() => provider.search(new SearchQuery('بحث')), ServiceUnavailableException);
  });

  it('rejects timeouts', async () => {
    const fetcher = (async () => {
      throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    const provider = new GooglePlacesProvider(API_KEY, OPTIONS, fetcher);
    await assert.rejects(() => provider.search(new SearchQuery('بحث')), ServiceUnavailableException);
  });

  it('rejects network failures', async () => {
    const fetcher = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const provider = new GooglePlacesProvider(API_KEY, OPTIONS, fetcher);
    await assert.rejects(() => provider.search(new SearchQuery('بحث')), ServiceUnavailableException);
  });

  it('rejects a malformed (non-JSON) response', async () => {
    const nonJsonFetcher = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => Promise.reject(new SyntaxError('unexpected token')),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const provider = new GooglePlacesProvider(API_KEY, OPTIONS, nonJsonFetcher);
    await assert.rejects(() => provider.search(new SearchQuery('بحث')), ServiceUnavailableException);
  });

  it('rejects a response without a places array', async () => {
    const { provider } = providerWith({ foo: 'bar' });
    await assert.rejects(() => provider.search(new SearchQuery('بحث')), ServiceUnavailableException);
  });

  it('rejects when the API key is missing', async () => {
    const { fetcher } = fetcherReturning({ places: [] });
    const provider = new GooglePlacesProvider('', OPTIONS, fetcher);
    await assert.rejects(() => provider.search(new SearchQuery('بحث')), ServiceUnavailableException);
  });
});

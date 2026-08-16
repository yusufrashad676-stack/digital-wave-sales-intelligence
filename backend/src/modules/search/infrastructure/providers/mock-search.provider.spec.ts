import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SearchQuery } from '../../domain/entities/search-query.js';
import { MockSearchProvider } from './mock-search.provider.js';

describe('MockSearchProvider', () => {
  const provider = new MockSearchProvider();

  it('exposes its provider id and capabilities', () => {
    assert.equal(provider.providerId, 'mock');
    assert.deepEqual(provider.capabilities, ['search']);
  });

  it('returns results for a plain query', async () => {
    const resultSet = await provider.search(new SearchQuery('عيادات في التجمع'));
    assert.equal(resultSet.providerId, 'mock');
    assert.ok(resultSet.results.length > 0);
  });

  it('is deterministic for identical input', async () => {
    const query = new SearchQuery('عيادات', { governorate: 'Cairo', minRating: 4 });
    const first = await provider.search(query);
    const second = await provider.search(query);
    assert.deepEqual(first, second);
  });

  it('filters by category', async () => {
    const resultSet = await provider.search(new SearchQuery('مطاعم', { category: 'restaurant' }));
    assert.ok(resultSet.results.length > 0);
    assert.ok(resultSet.results.every((result) => result.category === 'restaurant'));
  });

  it('filters by governorate', async () => {
    const resultSet = await provider.search(new SearchQuery('دلتا', { governorate: 'Alexandria' }));
    assert.ok(resultSet.results.length > 0);
    assert.ok(resultSet.results.every((result) => result.address?.startsWith('Alexandria')));
  });

  it('filters by minimum rating', async () => {
    const resultSet = await provider.search(new SearchQuery('مطاعم', { minRating: 4.5 }));
    assert.ok(resultSet.results.length > 0);
    assert.ok(resultSet.results.every((result) => (result.rating ?? 0) >= 4.5));
  });

  it('filters by verifiedOnly', async () => {
    const resultSet = await provider.search(new SearchQuery('مطاعم', { verifiedOnly: true }));
    assert.ok(resultSet.results.length > 0);
    assert.ok(resultSet.results.every((result) => result.verificationStatus === 'VERIFIED'));
  });

  it('returns an empty result set when no business matches the filters', async () => {
    const resultSet = await provider.search(new SearchQuery('مطاعم', { category: 'pharmacy' }));
    assert.deepEqual(resultSet.results, []);
  });

  it('returns an empty result set for an unknown keyword', async () => {
    const resultSet = await provider.search(new SearchQuery('xyz-not-found-zzz'));
    assert.deepEqual(resultSet.results, []);
  });

  it('matches a business by a partial name', async () => {
    const resultSet = await provider.search(new SearchQuery('أبو قير'));
    assert.ok(resultSet.results.length > 0);
    assert.ok(resultSet.results.every((result) => result.companyName.includes('أبو قير')));
  });

  it('infers the category from an Arabic query keyword', async () => {
    const resultSet = await provider.search(new SearchQuery('عيادات في التجمع'));
    assert.ok(resultSet.results.length > 0);
    assert.ok(resultSet.results.every((result) => result.category === 'clinic'));
  });

  it('infers the category from plural Arabic keywords', async () => {
    const restaurants = await provider.search(new SearchQuery('مطاعم'));
    assert.ok(restaurants.results.length > 0);
    assert.ok(restaurants.results.every((result) => result.category === 'restaurant'));

    const medical = await provider.search(new SearchQuery('مراكز طبية'));
    assert.ok(medical.results.length > 0);
    assert.ok(medical.results.every((result) => result.category === 'medical-center'));

    const dental = await provider.search(new SearchQuery('طب أسنان'));
    assert.ok(dental.results.length > 0);
    assert.ok(dental.results.every((result) => result.category === 'dental-clinic'));
  });

  it('produces stable provider record ids and source metadata', async () => {
    const resultSet = await provider.search(new SearchQuery('عيادات'));
    for (const result of resultSet.results) {
      assert.ok(result.providerRecordId.length > 0);
      assert.ok(result.sourceUrl?.startsWith('https://'));
      assert.equal(typeof result.rating, 'number');
    }
  });
});

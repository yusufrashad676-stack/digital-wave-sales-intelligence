import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SearchQuery } from '../../domain/entities/search-query.js';
import { MockSearchProvider } from './mock-search.provider.js';

describe('MockSearchProvider — R3 coordinates', () => {
  it('H: every generated business carries deterministic coordinates', async () => {
    const provider = new MockSearchProvider();
    const result = await provider.search(new SearchQuery(''));

    assert.ok(result.results.length > 0, 'expected at least one fixture');
    for (const business of result.results) {
      assert.equal(typeof business.latitude, 'number', `${business.companyName} must have latitude`);
      assert.equal(typeof business.longitude, 'number', `${business.companyName} must have longitude`);
      assert.ok(business.latitude >= -90 && business.latitude <= 90);
      assert.ok(business.longitude >= -180 && business.longitude <= 180);
    }
  });

  it('H2: the same query returns the same coordinate set (deterministic fixtures)', async () => {
    const provider = new MockSearchProvider();
    const a = await provider.search(new SearchQuery(''));
    const b = await provider.search(new SearchQuery(''));

    assert.equal(a.results[0].latitude, b.results[0].latitude);
    assert.equal(a.results[0].longitude, b.results[0].longitude);
  });
});

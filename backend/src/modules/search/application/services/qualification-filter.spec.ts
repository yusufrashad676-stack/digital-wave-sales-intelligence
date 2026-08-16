import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import type { SearchIntentCriteria } from '../../domain/entities/search-intent.js';
import { qualifyResults } from './qualification-filter.js';

function result(overrides: Partial<NormalizedSearchResult> = {}): NormalizedSearchResult {
  return new NormalizedSearchResult(
    'google-places',
    'ChIJ-test',
    'عيادةテスト',
    'dental-clinic',
    'Test Address',
    '+201001234567',
    overrides.website ?? null,
    4.5,
    100,
    'UNKNOWN',
    'https://maps.example.com',
    new Date(),
  );
}

function criteria(overrides: Partial<SearchIntentCriteria> = {}): SearchIntentCriteria {
  return { website: 'ANY', social: 'ANY', ...overrides };
}

describe('qualifyResults', () => {
  it('website ABSENT keeps businesses without website', () => {
    const results = qualifyResults([result({ website: null })], criteria({ website: 'ABSENT' }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.qualification.status, 'QUALIFIED');
    assert.equal(results[0]?.qualification.website.observed, 'ABSENT');
  });

  it('website ABSENT rejects businesses with website', () => {
    const results = qualifyResults([result({ website: 'https://example.com' })], criteria({ website: 'ABSENT' }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.qualification.status, 'REJECTED');
  });

  it('website PRESENT keeps businesses with website', () => {
    const results = qualifyResults([result({ website: 'https://example.com' })], criteria({ website: 'PRESENT' }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.qualification.status, 'QUALIFIED');
    assert.equal(results[0]?.qualification.website.observed, 'PRESENT');
  });

  it('website PRESENT rejects businesses without website', () => {
    const results = qualifyResults([result({ website: null })], criteria({ website: 'PRESENT' }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.qualification.status, 'REJECTED');
  });

  it('website ANY keeps all businesses', () => {
    const withWeb = result({ website: 'https://example.com' });
    const withoutWeb = result({ website: null });
    const results = qualifyResults([withWeb, withoutWeb], criteria({ website: 'ANY' }));
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.qualification.status === 'QUALIFIED'));
  });

  it('social PRESENT returns UNVERIFIED_SOCIAL', () => {
    const results = qualifyResults([result()], criteria({ social: 'PRESENT' }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.qualification.status, 'UNVERIFIED_SOCIAL');
    assert.equal(results[0]?.qualification.social.observed, 'UNKNOWN');
    assert.ok(results[0]?.qualification.reason.includes('enrichment'));
  });

  it('social ABSENT returns UNVERIFIED_SOCIAL', () => {
    const results = qualifyResults([result()], criteria({ social: 'ABSENT' }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.qualification.status, 'UNVERIFIED_SOCIAL');
  });

  it('social ANY does not add social qualification', () => {
    const results = qualifyResults([result()], criteria({ social: 'ANY' }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.qualification.status, 'QUALIFIED');
  });

  it('mixed website results with ANY social', () => {
    const withWeb = result({ website: 'https://example.com' });
    const withoutWeb = result({ website: null });
    const results = qualifyResults([withWeb, withoutWeb], criteria({ website: 'ANY', social: 'ANY' }));
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.qualification.status === 'QUALIFIED'));
  });

  it('website ABSENT + social PRESENT rejects website but still marks social', () => {
    const results = qualifyResults(
      [result({ website: 'https://example.com' })],
      criteria({ website: 'ABSENT', social: 'PRESENT' }),
    );
    assert.equal(results.length, 1);
    assert.equal(results[0]?.qualification.status, 'REJECTED');
    assert.equal(results[0]?.qualification.social.observed, 'UNKNOWN');
  });

  it('preserves business data in qualified results', () => {
    const r = result({ website: 'https://example.com' });
    const results = qualifyResults([r], criteria({ website: 'PRESENT' }));
    assert.equal(results[0]?.providerRecordId, 'ChIJ-test');
    assert.equal(results[0]?.companyName, 'عيادةテスト');
    assert.equal(results[0]?.website, 'https://example.com');
    assert.equal(results[0]?.rating, 4.5);
  });

  it('empty results array returns empty', () => {
    const results = qualifyResults([], criteria());
    assert.deepEqual(results, []);
  });
});

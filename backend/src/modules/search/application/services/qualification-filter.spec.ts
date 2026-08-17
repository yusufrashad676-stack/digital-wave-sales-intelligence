import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';
import type { SearchIntentCriteria } from '../../domain/entities/search-intent.js';
import { qualifyResults, requalifyWithEnrichment } from './qualification-filter.js';
import type { QualifiedResult } from '../../domain/entities/discovery-run.js';

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

function qualifiedResult(overrides: Partial<QualifiedResult> = {}): QualifiedResult {
  return {
    providerId: 'google-places',
    providerRecordId: 'ChIJ-test',
    companyName: 'Test Clinic',
    category: 'dental-clinic',
    address: 'Test Address',
    phone: '+201001234567',
    website: 'https://example.com',
    rating: 4.5,
    ratingCount: 100,
    sourceUrl: 'https://maps.example.com',
    qualification: {
      website: { requested: 'PRESENT', observed: 'PRESENT', source: 'google-places' },
      social: { requested: 'PRESENT', observed: 'UNKNOWN', source: null },
      status: 'UNVERIFIED_SOCIAL',
      reason: 'Social presence requires enrichment',
    },
    ...overrides,
  };
}

function snapshotWith(overrides: Partial<EnrichmentSnapshot> = {}): EnrichmentSnapshot {
  return {
    enrichedAt: new Date().toISOString(),
    enrichmentVersion: 1,
    ...overrides,
  };
}

describe('requalifyWithEnrichment', () => {
  it('social PRESENT + verified profile found → QUALIFIED', () => {
    const result = qualifiedResult();
    const snapshot = snapshotWith({
      social: {
        profiles: [
          {
            platform: 'facebook',
            handle: 'testclinic',
            profileUrl: 'https://facebook.com/testclinic',
            confidence: 0.9,
            verified: true,
          },
        ],
        discoveredAt: new Date().toISOString(),
        provider: 'http-social-discovery',
      },
    });
    const requalified = requalifyWithEnrichment(result, snapshot);
    assert.equal(requalified.qualification.status, 'QUALIFIED');
    assert.equal(requalified.qualification.social.observed, 'PRESENT');
    assert.equal(requalified.qualification.social.source, 'enrichment');
  });

  it('social PRESENT + unverified profile found → UNVERIFIED_SOCIAL', () => {
    const result = qualifiedResult();
    const snapshot = snapshotWith({
      social: {
        profiles: [
          {
            platform: 'facebook',
            handle: 'testclinic',
            profileUrl: 'https://facebook.com/testclinic',
            confidence: 0.9,
            verified: false,
          },
        ],
        discoveredAt: new Date().toISOString(),
        provider: 'http-social-discovery',
      },
    });
    const requalified = requalifyWithEnrichment(result, snapshot);
    assert.equal(requalified.qualification.status, 'UNVERIFIED_SOCIAL');
    assert.equal(requalified.qualification.social.observed, 'PRESENT');
  });

  it('social PRESENT + no profiles found → REJECTED', () => {
    const result = qualifiedResult();
    const snapshot = snapshotWith({
      social: { profiles: [], discoveredAt: new Date().toISOString(), provider: 'http-social-discovery' },
    });
    const requalified = requalifyWithEnrichment(result, snapshot);
    assert.equal(requalified.qualification.status, 'REJECTED');
    assert.equal(requalified.qualification.social.observed, 'ABSENT');
  });

  it('social ABSENT + profiles found → REJECTED', () => {
    const result = qualifiedResult({
      qualification: {
        website: { requested: 'PRESENT', observed: 'PRESENT', source: 'google-places' },
        social: { requested: 'ABSENT', observed: 'UNKNOWN', source: null },
        status: 'UNVERIFIED_SOCIAL',
        reason: 'Social presence requires enrichment',
      },
    });
    const snapshot = snapshotWith({
      social: {
        profiles: [
          {
            platform: 'instagram',
            handle: 'test',
            profileUrl: 'https://instagram.com/test',
            confidence: 0.8,
            verified: true,
          },
        ],
        discoveredAt: new Date().toISOString(),
        provider: 'http-social-discovery',
      },
    });
    const requalified = requalifyWithEnrichment(result, snapshot);
    assert.equal(requalified.qualification.status, 'REJECTED');
    assert.equal(requalified.qualification.social.observed, 'PRESENT');
  });

  it('social ABSENT + no profiles found → QUALIFIED', () => {
    const result = qualifiedResult({
      qualification: {
        website: { requested: 'PRESENT', observed: 'PRESENT', source: 'google-places' },
        social: { requested: 'ABSENT', observed: 'UNKNOWN', source: null },
        status: 'UNVERIFIED_SOCIAL',
        reason: 'Social presence requires enrichment',
      },
    });
    const snapshot = snapshotWith({
      social: { profiles: [], discoveredAt: new Date().toISOString(), provider: 'http-social-discovery' },
    });
    const requalified = requalifyWithEnrichment(result, snapshot);
    assert.equal(requalified.qualification.status, 'QUALIFIED');
    assert.equal(requalified.qualification.social.observed, 'ABSENT');
  });

  it('social ANY → always QUALIFIED regardless of enrichment', () => {
    const result = qualifiedResult({
      qualification: {
        website: { requested: 'PRESENT', observed: 'PRESENT', source: 'google-places' },
        social: { requested: 'ANY', observed: 'UNKNOWN', source: null },
        status: 'QUALIFIED',
        reason: 'All criteria satisfied',
      },
    });
    const snapshot = snapshotWith({
      social: {
        profiles: [
          { platform: 'facebook', handle: 'x', profileUrl: 'https://facebook.com/x', confidence: 0.9, verified: true },
        ],
        discoveredAt: new Date().toISOString(),
        provider: 'http-social-discovery',
      },
    });
    const requalified = requalifyWithEnrichment(result, snapshot);
    assert.equal(requalified.qualification.status, 'QUALIFIED');
  });

  it('mixed results: some enriched, some not → correct per-result qualification', () => {
    const resultWithSocial = qualifiedResult({ providerRecordId: 'r1' });
    const resultWithoutSocial = qualifiedResult({ providerRecordId: 'r2' });
    const snapshot = snapshotWith({
      social: {
        profiles: [
          {
            platform: 'facebook',
            handle: 'clinic',
            profileUrl: 'https://facebook.com/clinic',
            confidence: 0.9,
            verified: true,
          },
        ],
        discoveredAt: new Date().toISOString(),
        provider: 'http-social-discovery',
      },
    });
    const r1 = requalifyWithEnrichment(resultWithSocial, snapshot);
    const r2 = requalifyWithEnrichment(resultWithoutSocial, null);
    assert.equal(r1.qualification.status, 'QUALIFIED');
    assert.equal(r2.qualification.status, 'REJECTED');
  });

  it('enrichment snapshot missing social data → treated as not found', () => {
    const result = qualifiedResult();
    const requalified = requalifyWithEnrichment(result, null);
    assert.equal(requalified.qualification.status, 'REJECTED');
    assert.equal(requalified.qualification.social.observed, 'ABSENT');
  });

  it('multiple platforms: at least one verified → QUALIFIED for PRESENT', () => {
    const result = qualifiedResult();
    const snapshot = snapshotWith({
      social: {
        profiles: [
          {
            platform: 'facebook',
            handle: 'clinic',
            profileUrl: 'https://facebook.com/clinic',
            confidence: 0.9,
            verified: false,
          },
          {
            platform: 'instagram',
            handle: 'clinic',
            profileUrl: 'https://instagram.com/clinic',
            confidence: 0.8,
            verified: true,
          },
          {
            platform: 'twitter',
            handle: 'clinic',
            profileUrl: 'https://twitter.com/clinic',
            confidence: 0.7,
            verified: false,
          },
        ],
        discoveredAt: new Date().toISOString(),
        provider: 'http-social-discovery',
      },
    });
    const requalified = requalifyWithEnrichment(result, snapshot);
    assert.equal(requalified.qualification.status, 'QUALIFIED');
    assert.equal(requalified.qualification.social.observed, 'PRESENT');
  });
});

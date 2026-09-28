import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';
import type { ExecutionResultRow } from '../../domain/ports/enrichment.repository.js';
import { computeQualification, extractCriteria, DEFAULT_CRITERIA } from './execution-qualification.js';

function makeRow(overrides: Partial<ExecutionResultRow> = {}): ExecutionResultRow {
  return {
    id: 'row-1',
    executionId: 'exec-1',
    providerId: 'google-places',
    providerRecordId: 'rec-1',
    companyName: 'Test Business',
    category: 'restaurant',
    formattedAddress: '1 Test St',
    area: null,
    phone: '0100',
    email: null,
    websiteDomain: 'test.com',
    rating: 4.5,
    ratingCount: 10,
    sourceUrl: 'https://maps.google.com/x',
    verificationStatus: 'UNKNOWN',
    ordering: 0,
    retrievedAt: new Date('2026-08-17T16:49:08.009Z'),
    enrichmentStatus: 'PENDING',
    enrichmentSnapshot: null,
    enrichedAt: null,
    ...overrides,
  };
}

function socialSnapshot(profiles: Array<{ verified: boolean }>): EnrichmentSnapshot {
  return {
    enrichedAt: '2026-08-17T16:50:38.000Z',
    enrichmentVersion: 1,
    social: {
      profiles: profiles.map((profile, index) => ({
        platform: 'facebook',
        handle: `handle-${index}`,
        profileUrl: `https://facebook.com/handle-${index}`,
        confidence: 0.9,
        verified: profile.verified,
      })),
      discoveredAt: '2026-08-17T16:50:38.000Z',
      provider: 'http-social-discovery',
    },
  };
}

describe('extractCriteria', () => {
  it('returns ANY/ANY for null or non-object filters', () => {
    assert.deepEqual(extractCriteria(null), DEFAULT_CRITERIA);
    assert.deepEqual(extractCriteria(undefined), DEFAULT_CRITERIA);
    assert.deepEqual(extractCriteria('string'), DEFAULT_CRITERIA);
  });

  it('returns ANY/ANY for legacy filters without intent', () => {
    assert.deepEqual(extractCriteria({ governorate: 'Cairo', category: 'clinic' }), DEFAULT_CRITERIA);
  });

  it('extracts criteria from run filters containing intent', () => {
    const filters = { intent: { criteria: { website: 'ABSENT', social: 'PRESENT' } } };
    assert.deepEqual(extractCriteria(filters), { website: 'ABSENT', social: 'PRESENT' });
  });

  it('falls back to ANY for invalid criteria values', () => {
    const filters = { intent: { criteria: { website: 'MAYBE', social: 42 } } };
    assert.deepEqual(extractCriteria(filters), DEFAULT_CRITERIA);
  });

  it('handles malformed intent shapes', () => {
    assert.deepEqual(extractCriteria({ intent: 'corrupt' }), DEFAULT_CRITERIA);
    assert.deepEqual(extractCriteria({ intent: { criteria: null } }), DEFAULT_CRITERIA);
  });
});

describe('computeQualification', () => {
  it('QUALIFIED for ANY/ANY criteria regardless of enrichment', () => {
    const qualification = computeQualification(makeRow(), { website: 'ANY', social: 'ANY' });
    assert.equal(qualification.status, 'QUALIFIED');
  });

  it('REJECTED at discovery level when website criterion mismatches', () => {
    const qualification = computeQualification(makeRow({ websiteDomain: 'test.com' }), {
      website: 'ABSENT',
      social: 'ANY',
    });
    assert.equal(qualification.status, 'REJECTED');
    assert.equal(qualification.website.observed, 'PRESENT');
  });

  it('UNVERIFIED_SOCIAL when social required but enrichment never ran (no false REJECTED)', () => {
    const qualification = computeQualification(makeRow({ enrichmentSnapshot: null }), {
      website: 'ANY',
      social: 'PRESENT',
    });
    assert.equal(qualification.status, 'UNVERIFIED_SOCIAL');
  });

  it('UNVERIFIED_SOCIAL preserved when social discovery failed (snapshot without social section)', () => {
    const snapshot: EnrichmentSnapshot = {
      enrichedAt: '2026-08-17T16:50:38.000Z',
      enrichmentVersion: 1,
      errors: [{ type: 'social', message: 'down', provider: 'p' }],
    };
    const qualification = computeQualification(
      makeRow({ enrichmentStatus: 'PARTIALLY_ENRICHED', enrichmentSnapshot: snapshot }),
      { website: 'ANY', social: 'PRESENT' },
    );
    assert.equal(qualification.status, 'UNVERIFIED_SOCIAL');
  });

  it('QUALIFIED when verified social profile found and PRESENT required', () => {
    const qualification = computeQualification(
      makeRow({ enrichmentStatus: 'ENRICHED', enrichmentSnapshot: socialSnapshot([{ verified: true }]) }),
      { website: 'ANY', social: 'PRESENT' },
    );
    assert.equal(qualification.status, 'QUALIFIED');
    assert.equal(qualification.social.observed, 'PRESENT');
    assert.equal(qualification.social.source, 'enrichment');
  });

  it('UNVERIFIED_SOCIAL when profiles found but none verified and PRESENT required', () => {
    const qualification = computeQualification(
      makeRow({ enrichmentStatus: 'ENRICHED', enrichmentSnapshot: socialSnapshot([{ verified: false }]) }),
      { website: 'ANY', social: 'PRESENT' },
    );
    assert.equal(qualification.status, 'UNVERIFIED_SOCIAL');
  });

  it('REJECTED when PRESENT required and discovery ran with zero profiles', () => {
    const qualification = computeQualification(
      makeRow({ enrichmentStatus: 'ENRICHED', enrichmentSnapshot: socialSnapshot([]) }),
      { website: 'ANY', social: 'PRESENT' },
    );
    assert.equal(qualification.status, 'REJECTED');
    assert.equal(qualification.social.observed, 'ABSENT');
  });

  it('REJECTED when ABSENT required but profiles found', () => {
    const qualification = computeQualification(
      makeRow({ enrichmentStatus: 'ENRICHED', enrichmentSnapshot: socialSnapshot([{ verified: false }]) }),
      { website: 'ANY', social: 'ABSENT' },
    );
    assert.equal(qualification.status, 'REJECTED');
  });

  it('QUALIFIED when ABSENT required and discovery ran with zero profiles', () => {
    const qualification = computeQualification(
      makeRow({ enrichmentStatus: 'ENRICHED', enrichmentSnapshot: socialSnapshot([]) }),
      { website: 'ANY', social: 'ABSENT' },
    );
    assert.equal(qualification.status, 'QUALIFIED');
  });

  it('UNVERIFIED_SOCIAL when ABSENT required but social section missing (no false QUALIFIED)', () => {
    const snapshot: EnrichmentSnapshot = { enrichedAt: '2026-08-17T16:50:38.000Z', enrichmentVersion: 1 };
    const qualification = computeQualification(
      makeRow({ enrichmentStatus: 'ENRICHMENT_FAILED', enrichmentSnapshot: snapshot }),
      { website: 'ANY', social: 'ABSENT' },
    );
    assert.equal(qualification.status, 'UNVERIFIED_SOCIAL');
  });
});

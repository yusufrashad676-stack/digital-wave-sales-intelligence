import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProviderSearchResult } from '../../domain/entities/provider-result.js';
import { normalizeProviderResult } from './normalize-provider-result.js';

function makeProviderResult(overrides: Partial<ProviderSearchResult> = {}): ProviderSearchResult {
  return {
    providerRecordId: 'rec-1',
    companyName: '  Test   Clinic ',
    category: 'Dentist',
    address: 'Cairo',
    phone: '+20 100 123 4567',
    website: 'https://www.test.com',
    rating: 4.56,
    ratingCount: 12,
    verificationStatus: 'UNVERIFIED',
    sourceUrl: 'https://maps.test/rec-1',
    latitude: 30.0166,
    longitude: 31.4968,
    ...overrides,
  };
}

describe('normalizeProviderResult — R3 coordinates', () => {
  it('H: in-range coordinates flow through the normalized result', () => {
    const normalized = normalizeProviderResult(makeProviderResult(), 'google-places', new Date());

    assert.equal(normalized.latitude, 30.0166);
    assert.equal(normalized.longitude, 31.4968);
  });

  it('I: absent coordinates normalize to null (never fabricated)', () => {
    const normalized = normalizeProviderResult(
      makeProviderResult({ latitude: undefined, longitude: undefined }),
      'google-places',
      new Date(),
    );

    assert.equal(normalized.latitude, null);
    assert.equal(normalized.longitude, null);
  });

  it('I2: out-of-range coordinates are ignored instead of persisted', () => {
    const normalized = normalizeProviderResult(
      makeProviderResult({ latitude: 95, longitude: -999 }),
      'google-places',
      new Date(),
    );

    assert.equal(normalized.latitude, null);
    assert.equal(normalized.longitude, null);
  });
});

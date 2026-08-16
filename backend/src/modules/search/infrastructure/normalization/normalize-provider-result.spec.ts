import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProviderSearchResult } from '../../domain/entities/provider-result.js';
import {
  normalizePhone,
  normalizeProviderResult,
  normalizeRating,
  normalizeText,
  normalizeWebsite,
} from './normalize-provider-result.js';

const RETRIEVED_AT = new Date('2026-08-10T10:00:00.000Z');

function result(overrides: Partial<ProviderSearchResult> = {}): ProviderSearchResult {
  return { providerRecordId: 'mock-1', companyName: 'عيادة د. أحمد', ...overrides };
}

describe('normalizeProviderResult', () => {
  it('normalizes a raw provider result into a canonical shape', () => {
    const normalized = normalizeProviderResult(
      result({
        companyName: '  عيادة   د. أحمد   ',
        category: 'clinic',
        address: '  القاهرة  ',
        area: '  التجمع الخامس  ',
        phone: '+20 100 123 4567',
        website: 'https://www.Example.com/path?x=1',
        rating: 4.67,
        ratingCount: 128,
        verificationStatus: 'VERIFIED',
      }),
      'mock',
      RETRIEVED_AT,
    );

    assert.equal(normalized.providerId, 'mock');
    assert.equal(normalized.providerRecordId, 'mock-1');
    assert.equal(normalized.companyName, 'عيادة د. أحمد');
    assert.equal(normalized.category, 'clinic');
    assert.equal(normalized.address, 'القاهرة');
    assert.equal(normalized.area, 'التجمع الخامس');
    assert.equal(normalized.phone, '+201001234567');
    assert.equal(normalized.website, 'https://www.example.com');
    assert.equal(normalized.rating, 4.7);
    assert.equal(normalized.ratingCount, 128);
    assert.equal(normalized.verificationStatus, 'VERIFIED');
    assert.equal(normalized.retrievedAt, RETRIEVED_AT);
  });

  it('maps missing provider values to null and unknown verification to UNKNOWN', () => {
    const normalized = normalizeProviderResult(result({}), 'mock', RETRIEVED_AT);
    assert.equal(normalized.category, null);
    assert.equal(normalized.address, null);
    assert.equal(normalized.area, null);
    assert.equal(normalized.phone, null);
    assert.equal(normalized.website, null);
    assert.equal(normalized.rating, null);
    assert.equal(normalized.verificationStatus, 'UNKNOWN');
  });

  it('maps UNVERIFIED verification status', () => {
    const normalized = normalizeProviderResult(result({ verificationStatus: 'UNVERIFIED' }), 'mock', RETRIEVED_AT);
    assert.equal(normalized.verificationStatus, 'UNVERIFIED');
  });
});

describe('normalizeText', () => {
  it('trims and collapses whitespace', () => {
    assert.equal(normalizeText('  عيادة   د. أحمد  '), 'عيادة د. أحمد');
  });

  it('returns null for undefined or blank input', () => {
    assert.equal(normalizeText(undefined), null);
    assert.equal(normalizeText('   '), null);
  });
});

describe('normalizePhone', () => {
  it('strips formatting and keeps an international prefix', () => {
    assert.equal(normalizePhone('+20 100 123 4567'), '+201001234567');
  });

  it('converts a leading 00 into an international prefix', () => {
    assert.equal(normalizePhone('0020 100 123 4567'), '+201001234567');
  });

  it('preserves a local number without inventing a country code', () => {
    assert.equal(normalizePhone('0100 123 4567'), '01001234567');
  });

  it('returns null for blank or invalid input', () => {
    assert.equal(normalizePhone(undefined), null);
    assert.equal(normalizePhone('  -  '), null);
  });
});

describe('normalizeWebsite', () => {
  it('keeps a canonical https URL', () => {
    assert.equal(normalizeWebsite('https://www.example.com'), 'https://www.example.com');
  });

  it('adds a protocol and strips path and query', () => {
    assert.equal(normalizeWebsite('www.EXAMPLE.com/path?x=1'), 'https://www.example.com');
  });

  it('returns null for blank or invalid input', () => {
    assert.equal(normalizeWebsite(undefined), null);
    assert.equal(normalizeWebsite('not a url'), null);
  });
});

describe('normalizeRating', () => {
  it('rounds to one decimal place', () => {
    assert.equal(normalizeRating(4.67), 4.7);
  });

  it('returns null outside the 0..5 range', () => {
    assert.equal(normalizeRating(6), null);
    assert.equal(normalizeRating(-1), null);
  });

  it('returns null for non-numbers', () => {
    assert.equal(normalizeRating(undefined), null);
  });
});

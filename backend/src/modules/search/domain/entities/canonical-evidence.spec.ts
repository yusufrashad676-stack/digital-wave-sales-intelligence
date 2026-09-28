import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeEmail,
  normalizeLatitude,
  normalizeLongitude,
  normalizePhone,
  normalizeText,
  normalizeWebsiteEvidence,
} from './canonical-evidence.js';

describe('normalizePhone (observed evidence)', () => {
  it('keeps an existing international prefix', () => {
    assert.equal(normalizePhone('+20 100 123 4567'), '+201001234567');
  });

  it('converts a leading 00 into an international prefix', () => {
    assert.equal(normalizePhone('0020 100 123 4567'), '+201001234567');
  });

  it('preserves a local number without inventing a country code', () => {
    assert.equal(normalizePhone('0100 123 4567'), '01001234567');
  });

  it('returns null for blank input (UNKNOWN, never a fabricated negative)', () => {
    assert.equal(normalizePhone(undefined), null);
    assert.equal(normalizePhone('   '), null);
  });
});

describe('normalizeEmail (observed evidence)', () => {
  it('lowercases and trims a valid email', () => {
    assert.equal(normalizeEmail('  Info@Example.COM '), 'info@example.com');
  });

  it('accepts allowlisted special characters in the local part', () => {
    assert.equal(normalizeEmail('sale+tag@example.com'), 'sale+tag@example.com');
    assert.equal(normalizeEmail('a.b_c-d@example.com'), 'a.b_c-d@example.com');
  });

  it('rejects malformed values (UNKNOWN, not ABSENT)', () => {
    assert.equal(normalizeEmail('not-an-email'), null);
    assert.equal(normalizeEmail('a@b'), null);
    assert.equal(normalizeEmail('a@b..c'), null);
  });

  it('rejects blank and overlong values', () => {
    assert.equal(normalizeEmail(undefined), null);
    assert.equal(normalizeEmail(`a@${'x'.repeat(250)}.com`), null);
  });
});

describe('normalizeWebsiteEvidence', () => {
  it('derives a canonical domain and https URL', () => {
    assert.deepEqual(normalizeWebsiteEvidence('https://www.Example.com/path?x=1'), {
      domain: 'www.example.com',
      url: 'https://www.example.com',
    });
  });

  it('rejects unparseable references', () => {
    assert.equal(normalizeWebsiteEvidence('not a url'), null);
    assert.equal(normalizeWebsiteEvidence(undefined), null);
  });
});

describe('coordinates', () => {
  it('accepts in-range finite values', () => {
    assert.equal(normalizeLatitude(30.0166), 30.0166);
    assert.equal(normalizeLongitude(31.4968), 31.4968);
    assert.equal(normalizeLatitude(-90), -90);
    assert.equal(normalizeLongitude(180), 180);
  });

  it('maps missing or out-of-range values to null (UNKNOWN)', () => {
    assert.equal(normalizeLatitude(undefined), null);
    assert.equal(normalizeLongitude(undefined), null);
    assert.equal(normalizeLatitude(91), null);
    assert.equal(normalizeLatitude(-91), null);
    assert.equal(normalizeLongitude(181), null);
    assert.equal(normalizeLatitude(Number.NaN), null);
    assert.equal(normalizeLongitude(Number.POSITIVE_INFINITY), null);
  });
});

describe('normalizeText', () => {
  it('trim-collapses whitespace', () => {
    assert.equal(normalizeText('  a   b  '), 'a b');
  });
});

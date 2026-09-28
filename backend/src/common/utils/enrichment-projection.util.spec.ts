import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EnrichmentSnapshot } from '../../modules/search/domain/entities/enrichment-snapshot.js';
import { projectEnrichment } from './enrichment-projection.util.js';

function makeSnapshot(overrides: Partial<EnrichmentSnapshot> = {}): EnrichmentSnapshot {
  return {
    enrichedAt: '2026-08-17T16:50:38.000Z',
    enrichmentVersion: 1,
    website: {
      title: 'The Old Mill Restaurant',
      description: 'Traditional Irish restaurant',
      techHints: ['wordpress'],
      socialLinks: ['https://facebook.com/oldmill'],
      fetchedAt: '2026-08-17T16:50:37.000Z',
      provider: 'http-website-enrichment',
    },
    social: {
      profiles: [
        {
          platform: 'facebook',
          handle: 'oldmill',
          profileUrl: 'https://facebook.com/oldmill',
          confidence: 0.9,
          verified: true,
        },
      ],
      discoveredAt: '2026-08-17T16:50:38.000Z',
      provider: 'http-social-discovery',
    },
    ...overrides,
  };
}

describe('projectEnrichment', () => {
  it('returns null for PENDING status', () => {
    assert.equal(projectEnrichment('PENDING', null, null), null);
    assert.equal(projectEnrichment('PENDING', makeSnapshot(), new Date()), null);
  });

  it('returns honest empty block for SKIPPED', () => {
    const view = projectEnrichment('SKIPPED', null, null);
    assert.ok(view);
    assert.equal(view.status, 'SKIPPED');
    assert.equal(view.enrichedAt, null);
    assert.equal(view.website, null);
    assert.equal(view.social, null);
  });

  it('returns honest empty block for IN_PROGRESS', () => {
    const view = projectEnrichment('IN_PROGRESS', null, null);
    assert.ok(view);
    assert.equal(view.status, 'IN_PROGRESS');
    assert.equal(view.website, null);
    assert.equal(view.social, null);
  });

  it('maps full enriched snapshot without exposing errors', () => {
    const snapshot = makeSnapshot({
      errors: [{ type: 'social', message: 'Internal provider failure detail', provider: 'x' }],
    });
    const view = projectEnrichment('ENRICHED', snapshot, new Date('2026-08-17T16:51:00.000Z'));
    assert.ok(view);
    assert.equal(view.status, 'ENRICHED');
    assert.equal(view.enrichedAt, '2026-08-17T16:51:00.000Z');
    assert.equal(view.website?.title, 'The Old Mill Restaurant');
    assert.equal(view.website?.description, 'Traditional Irish restaurant');
    assert.deepEqual(view.website?.techHints, ['wordpress']);
    assert.deepEqual(view.website?.socialLinks, ['https://facebook.com/oldmill']);
    assert.equal(view.social?.profiles.length, 1);
    assert.equal(view.social?.profiles[0]?.platform, 'facebook');
    assert.equal(view.social?.profiles[0]?.verified, true);
    const serialized = JSON.stringify(view);
    assert.ok(!serialized.includes('errors'), 'errors must not be exposed');
    assert.ok(!serialized.includes('Internal provider failure detail'));
  });

  it('returns website-only projection for partial enrichment', () => {
    const snapshot = makeSnapshot({ social: undefined });
    const view = projectEnrichment('PARTIALLY_ENRICHED', snapshot, new Date());
    assert.ok(view);
    assert.equal(view.status, 'PARTIALLY_ENRICHED');
    assert.ok(view.website);
    assert.equal(view.social, null);
  });

  it('filters unsafe social links and keeps http(s) links', () => {
    const snapshot = makeSnapshot({
      website: {
        title: null,
        description: null,
        techHints: [],
        socialLinks: [
          'https://facebook.com/ok',
          'http://twitter.com/also-ok',
          'javascript:alert(1)',
          'data:text/html;base64,xxx',
          'not-a-url',
        ],
        fetchedAt: '2026-08-17T16:50:37.000Z',
        provider: 'p',
      },
    });
    const view = projectEnrichment('ENRICHED', snapshot, null);
    assert.deepEqual(view?.website?.socialLinks, ['https://facebook.com/ok', 'http://twitter.com/also-ok']);
  });

  it('nulls unsafe profile URLs but keeps the profile row honest', () => {
    const snapshot = makeSnapshot({
      social: {
        profiles: [
          { platform: 'facebook', handle: 'a', profileUrl: 'javascript:alert(1)', confidence: 0.9, verified: true },
          {
            platform: 'instagram',
            handle: 'b',
            profileUrl: 'https://instagram.com/b',
            confidence: 0.8,
            verified: false,
          },
        ],
        discoveredAt: '2026-08-17T16:50:38.000Z',
        provider: 'p',
      },
    });
    const view = projectEnrichment('ENRICHED', snapshot, null);
    assert.equal(view?.social?.profiles[0]?.profileUrl, null);
    assert.equal(view?.social?.profiles[0]?.platform, 'facebook');
    assert.equal(view?.social?.profiles[1]?.profileUrl, 'https://instagram.com/b');
  });

  it('does not convert ENRICHMENT_FAILED into a success-looking block', () => {
    const snapshot = makeSnapshot({
      website: undefined,
      social: undefined,
      errors: [{ type: 'website', message: 'boom', provider: 'p' }],
    });
    const view = projectEnrichment('ENRICHMENT_FAILED', snapshot, new Date());
    assert.ok(view);
    assert.equal(view.status, 'ENRICHMENT_FAILED');
    assert.equal(view.website, null);
    assert.equal(view.social, null);
  });
});

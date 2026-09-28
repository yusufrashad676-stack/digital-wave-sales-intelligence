import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LeadEnrichmentSnapshot } from '../../domain/entities/lead.entity.js';
import { LeadResponseDto } from './lead-response.dto.js';
import { leadSnapshot } from '../../application/use-cases/lead-snapshot.fixture.js';

function snapshot(overrides: Partial<LeadEnrichmentSnapshot> = {}): LeadEnrichmentSnapshot {
  return {
    website: {
      title: 'Test Site',
      description: 'A description',
      techHints: ['wordpress'],
      socialLinks: ['https://facebook.com/a', 'javascript:alert(1)'],
    },
    social: {
      profiles: [
        { platform: 'facebook', handle: 'a', profileUrl: 'https://facebook.com/a', confidence: 0.9, verified: true },
        { platform: 'x', handle: 'evil', profileUrl: 'javascript:alert(1)', confidence: 0.7, verified: false },
      ],
    },
    errors: [{ type: 'social', message: 'internal provider error detail', provider: 'p' }],
    enrichedAt: '2026-08-17T16:50:38.000Z',
    enrichmentVersion: 1,
    ...overrides,
  };
}

describe('LeadResponseDto enrichment projection', () => {
  it('projects ENRICHED with website and social blocks', () => {
    const dto = LeadResponseDto.from(
      leadSnapshot({
        enrichmentStatus: 'ENRICHED',
        enrichmentSnapshot: snapshot(),
        enrichedAt: '2026-08-17T16:50:40.000Z',
      }),
    );

    assert.ok(dto.enrichment);
    assert.equal(dto.enrichment.status, 'ENRICHED');
    assert.equal(dto.enrichment.enrichedAt, '2026-08-17T16:50:40.000Z');
    assert.equal(dto.enrichment.website?.title, 'Test Site');
    assert.equal(dto.enrichment.website?.description, 'A description');
    assert.deepEqual(dto.enrichment.website?.techHints, ['wordpress']);
    assert.equal(dto.enrichment.social?.profiles.length, 2);
    assert.equal(dto.enrichment.social?.profiles[0]?.verified, true);
  });

  it('projects PARTIALLY_ENRICHED with website only when social section is absent', () => {
    const partial = { ...snapshot(), social: undefined } as LeadEnrichmentSnapshot;
    const dto = LeadResponseDto.from(
      leadSnapshot({ enrichmentStatus: 'PARTIALLY_ENRICHED', enrichmentSnapshot: partial }),
    );

    assert.ok(dto.enrichment);
    assert.equal(dto.enrichment.status, 'PARTIALLY_ENRICHED');
    assert.ok(dto.enrichment.website);
    assert.equal(dto.enrichment.social, null);
  });

  it('keeps FAILED, SKIPPED and IN_PROGRESS honest without success content', () => {
    for (const status of ['ENRICHMENT_FAILED', 'SKIPPED', 'IN_PROGRESS']) {
      const dto = LeadResponseDto.from(
        leadSnapshot({ enrichmentStatus: status, enrichmentSnapshot: null, enrichedAt: null }),
      );
      assert.ok(dto.enrichment, `${status} must produce a block`);
      assert.equal(dto.enrichment.status, status);
      assert.equal(dto.enrichment.website, null);
      assert.equal(dto.enrichment.social, null);
    }
  });

  it('returns null enrichment for PENDING', () => {
    const dto = LeadResponseDto.from(leadSnapshot());
    assert.equal(dto.enrichment, null);
  });

  it('filters unsafe URLs and nulls unsafe profile URLs', () => {
    const dto = LeadResponseDto.from(leadSnapshot({ enrichmentStatus: 'ENRICHED', enrichmentSnapshot: snapshot() }));

    assert.deepEqual(dto.enrichment?.website?.socialLinks, ['https://facebook.com/a']);
    assert.equal(dto.enrichment?.social?.profiles[1]?.profileUrl, null);
    assert.equal(dto.enrichment?.social?.profiles[1]?.platform, 'x');
  });

  it('never exposes provider error messages', () => {
    const dto = LeadResponseDto.from(leadSnapshot({ enrichmentStatus: 'ENRICHED', enrichmentSnapshot: snapshot() }));

    const serialized = JSON.stringify(dto);
    assert.ok(!serialized.includes('errors'));
    assert.ok(!serialized.includes('internal provider error detail'));
  });
});

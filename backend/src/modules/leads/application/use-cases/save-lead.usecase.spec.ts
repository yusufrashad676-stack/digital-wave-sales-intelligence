import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { ValidationException } from '../../../../common/exceptions/validation.exception.js';
import type { EnrichedSearchResultRecord } from '../../domain/ports/enriched-search-result-reader.js';
import type { EnrichedSearchResultReader } from '../../domain/ports/enriched-search-result-reader.js';
import type { LeadEnrichmentCopy, LeadEnrichmentSnapshot } from '../../domain/entities/lead.entity.js';
import type { LeadRepository } from '../../domain/ports/lead.repository.js';
import { leadSnapshot } from './lead-snapshot.fixture.js';
import { SaveLeadUseCase } from './save-lead.usecase.js';

function enrichedSnapshot(): LeadEnrichmentSnapshot {
  return {
    website: { title: 'Test Site', description: null, techHints: ['wordpress'], socialLinks: [] },
    social: {
      profiles: [
        { platform: 'facebook', handle: 'a', profileUrl: 'https://facebook.com/a', confidence: 0.9, verified: true },
      ],
    },
    enrichedAt: '2026-08-17T16:50:38.000Z',
    enrichmentVersion: 1,
  };
}

function makeSource(overrides: Partial<EnrichedSearchResultRecord> = {}): EnrichedSearchResultRecord {
  return {
    id: 'result-1',
    providerRecordId: 'rec-1',
    enrichmentStatus: 'ENRICHED',
    enrichmentSnapshot: enrichedSnapshot(),
    enrichedAt: new Date('2026-08-17T16:50:40.000Z'),
    ...overrides,
  };
}

function stubReader(source: EnrichedSearchResultRecord | null): EnrichedSearchResultReader & {
  calls: Array<{ searchResultId: string; userId: string }>;
} {
  const calls: Array<{ searchResultId: string; userId: string }> = [];
  return {
    calls,
    findByIdForUser: async (searchResultId: string, userId: string) => {
      calls.push({ searchResultId, userId });
      return source;
    },
  };
}

function stubRepo(): LeadRepository & {
  calls: Array<{ userId: string; enrichment: LeadEnrichmentCopy | null | undefined }>;
} {
  const calls: Array<{ userId: string; enrichment: LeadEnrichmentCopy | null | undefined }> = [];
  return {
    calls,
    save: async (userId: string, _input: unknown, enrichment?: LeadEnrichmentCopy | null) => {
      calls.push({ userId, enrichment });
      return leadSnapshot();
    },
    listByUser: async () => [],
    findOwned: async () => null,
    update: async () => null,
    remove: async () => true,
  } as unknown as LeadRepository & {
    calls: Array<{ userId: string; enrichment: LeadEnrichmentCopy | null | undefined }>;
  };
}

const BASE_INPUT = {
  providerId: 'google-places',
  providerRecordId: 'rec-1',
  companyName: 'Test Business',
  retrievedAt: '2026-08-15T10:00:00.000Z',
};

describe('SaveLeadUseCase', () => {
  it('persists the snapshot for the given user without enrichment source', async () => {
    const repository = stubRepo();
    const useCase = new SaveLeadUseCase(repository, stubReader(makeSource()));

    const result = await useCase.save('user-1', BASE_INPUT);

    assert.equal(result.id, 'lead-1');
    assert.equal(repository.calls.length, 1);
    assert.equal(repository.calls[0]?.userId, 'user-1');
    assert.equal(repository.calls[0]?.enrichment, null);
  });

  it('copies enrichment status, snapshot and enrichedAt from the source result', async () => {
    const repository = stubRepo();
    const reader = stubReader(makeSource());
    const useCase = new SaveLeadUseCase(repository, reader);

    await useCase.save('user-1', { ...BASE_INPUT, searchResultId: 'result-1' });

    assert.deepEqual(reader.calls, [{ searchResultId: 'result-1', userId: 'user-1' }]);
    assert.equal(repository.calls[0]?.enrichment?.enrichmentStatus, 'ENRICHED');
    assert.deepEqual(repository.calls[0]?.enrichment?.enrichmentSnapshot, enrichedSnapshot());
    assert.equal(repository.calls[0]?.enrichment?.enrichedAt?.toISOString(), '2026-08-17T16:50:40.000Z');
  });

  it('normalizes IN_PROGRESS source to PENDING with null snapshot', async () => {
    const repository = stubRepo();
    const useCase = new SaveLeadUseCase(repository, stubReader(makeSource({ enrichmentStatus: 'IN_PROGRESS' })));

    await useCase.save('user-1', { ...BASE_INPUT, searchResultId: 'result-1' });

    assert.deepEqual(repository.calls[0]?.enrichment, {
      enrichmentStatus: 'PENDING',
      enrichmentSnapshot: null,
      enrichedAt: null,
    });
  });

  it('copies PENDING source honestly (defaults)', async () => {
    const repository = stubRepo();
    const useCase = new SaveLeadUseCase(
      repository,
      stubReader(makeSource({ enrichmentStatus: 'PENDING', enrichmentSnapshot: null, enrichedAt: null })),
    );

    await useCase.save('user-1', { ...BASE_INPUT, searchResultId: 'result-1' });

    assert.deepEqual(repository.calls[0]?.enrichment, {
      enrichmentStatus: 'PENDING',
      enrichmentSnapshot: null,
      enrichedAt: null,
    });
  });

  it('copies PARTIALLY_ENRICHED source with snapshot', async () => {
    const repository = stubRepo();
    const partial = { ...enrichedSnapshot(), social: undefined } as LeadEnrichmentSnapshot;
    const useCase = new SaveLeadUseCase(
      repository,
      stubReader(makeSource({ enrichmentStatus: 'PARTIALLY_ENRICHED', enrichmentSnapshot: partial })),
    );

    await useCase.save('user-1', { ...BASE_INPUT, searchResultId: 'result-1' });

    assert.equal(repository.calls[0]?.enrichment?.enrichmentStatus, 'PARTIALLY_ENRICHED');
    assert.deepEqual(repository.calls[0]?.enrichment?.enrichmentSnapshot, partial);
  });

  it('copies ENRICHMENT_FAILED source with snapshot including errors (stored, not fabricated)', async () => {
    const repository = stubRepo();
    const failed = {
      ...enrichedSnapshot(),
      website: undefined,
      errors: [{ type: 'website', message: 'connect timeout', provider: 'http-website-enrichment' }],
    } as LeadEnrichmentSnapshot;
    const useCase = new SaveLeadUseCase(
      repository,
      stubReader(makeSource({ enrichmentStatus: 'ENRICHMENT_FAILED', enrichmentSnapshot: failed })),
    );

    await useCase.save('user-1', { ...BASE_INPUT, searchResultId: 'result-1' });

    assert.equal(repository.calls[0]?.enrichment?.enrichmentStatus, 'ENRICHMENT_FAILED');
    assert.deepEqual(repository.calls[0]?.enrichment?.enrichmentSnapshot, failed);
  });

  it('copies SKIPPED source with null snapshot', async () => {
    const repository = stubRepo();
    const useCase = new SaveLeadUseCase(
      repository,
      stubReader(makeSource({ enrichmentStatus: 'SKIPPED', enrichmentSnapshot: null, enrichedAt: null })),
    );

    await useCase.save('user-1', { ...BASE_INPUT, searchResultId: 'result-1' });

    assert.deepEqual(repository.calls[0]?.enrichment, {
      enrichmentStatus: 'SKIPPED',
      enrichmentSnapshot: null,
      enrichedAt: null,
    });
  });

  it('rejects a searchResultId that does not exist, belong to the user, or whose job is soft-deleted', async () => {
    const repository = stubRepo();
    const useCase = new SaveLeadUseCase(repository, stubReader(null));

    await assert.rejects(() => useCase.save('user-1', { ...BASE_INPUT, searchResultId: 'missing' }), NotFoundException);
    assert.equal(repository.calls.length, 0);
  });

  it('rejects a searchResultId whose providerRecordId does not match the input', async () => {
    const repository = stubRepo();
    const useCase = new SaveLeadUseCase(repository, stubReader(makeSource({ providerRecordId: 'different' })));

    await assert.rejects(
      () => useCase.save('user-1', { ...BASE_INPUT, searchResultId: 'result-1' }),
      ValidationException,
    );
    assert.equal(repository.calls.length, 0);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';
import type {
  EnrichmentRepository,
  ExecutionDetailRow,
  ExecutionResultRow,
} from '../../domain/ports/enrichment.repository.js';
import { GetExecutionResultsUseCase } from './get-execution-results.usecase.js';

const PRINCIPAL: AuthPrincipal = { userId: 'user-1', roles: ['MEMBER'], tokenType: 'access' };

function makeExecution(overrides: Partial<ExecutionDetailRow> = {}): ExecutionDetailRow {
  return {
    id: 'exec-1',
    jobId: 'job-1',
    status: 'COMPLETED',
    query: 'restaurants in Dublin',
    filters: { intent: { criteria: { website: 'ANY', social: 'PRESENT' } } },
    jobUserId: 'user-1',
    createdAt: new Date('2026-08-17T16:49:07.000Z'),
    finishedAt: null,
    metrics: null,
    ...overrides,
  };
}

function makeRow(overrides: Partial<ExecutionResultRow> = {}): ExecutionResultRow {
  return {
    id: 'row-1',
    executionId: 'exec-1',
    providerId: 'google-places',
    providerRecordId: 'rec-1',
    companyName: 'Test Business',
    category: 'restaurant',
    formattedAddress: '1 Test St',
    area: 'Dublin',
    phone: '0100',
    email: 'info@test.com',
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

function stubRepo(execution: ExecutionDetailRow | null, rows: ExecutionResultRow[]): EnrichmentRepository {
  return {
    findExecutionDetail: async () => execution,
    findFullResultsByExecutionId: async () => rows,
    findResultsByExecutionId: async () => rows,
    updateEnrichmentStatus: async () => {},
    resetStaleInProgress: async () => 0,
    countByEnrichmentStatus: async () => ({}),
    updateExecutionMetrics: async () => {},
    acquireEnrichmentLock: async () => true,
    releaseEnrichmentLock: async () => {},
  };
}

describe('GetExecutionResultsUseCase', () => {
  it('maps rows to result items with qualification and curated enrichment', async () => {
    const snapshot: EnrichmentSnapshot = {
      enrichedAt: '2026-08-17T16:50:38.000Z',
      enrichmentVersion: 1,
      website: {
        title: 'Test',
        description: 'Desc',
        techHints: ['wordpress'],
        socialLinks: ['https://facebook.com/a'],
        fetchedAt: '2026-08-17T16:50:37.000Z',
        provider: 'p',
      },
      social: {
        profiles: [
          { platform: 'facebook', handle: 'a', profileUrl: 'https://facebook.com/a', confidence: 0.9, verified: true },
        ],
        discoveredAt: '2026-08-17T16:50:38.000Z',
        provider: 'p',
      },
      errors: [{ type: 'social', message: 'internal detail', provider: 'p' }],
    };
    const rows = [
      makeRow({
        id: 'enriched-row',
        enrichmentStatus: 'ENRICHED',
        enrichmentSnapshot: snapshot,
        enrichedAt: new Date('2026-08-17T16:50:40.000Z'),
      }),
      makeRow({ id: 'pending-row', ordering: 1 }),
    ];
    const useCase = new GetExecutionResultsUseCase(stubRepo(makeExecution(), rows));

    const { results, count } = await useCase.execute('exec-1', PRINCIPAL);

    assert.equal(count, 2);
    assert.equal(results.length, 2);

    const enriched = results[0];
    assert.ok(enriched);
    assert.equal(enriched.resultId, 'enriched-row');
    assert.equal(enriched.companyName, 'Test Business');
    assert.equal(enriched.address, '1 Test St');
    assert.equal(enriched.area, 'Dublin');
    assert.equal(enriched.email, 'info@test.com');
    assert.equal(enriched.website, 'test.com');
    assert.equal(enriched.retrievedAt, '2026-08-17T16:49:08.009Z');
    assert.equal(enriched.qualification.status, 'QUALIFIED');
    assert.equal(enriched.qualification.social.source, 'enrichment');
    assert.ok(enriched.enrichment);
    assert.equal(enriched.enrichment.status, 'ENRICHED');
    assert.equal(enriched.enrichment.enrichedAt, '2026-08-17T16:50:40.000Z');
    assert.equal(enriched.enrichment.website?.title, 'Test');
    assert.equal(enriched.enrichment.social?.profiles[0]?.verified, true);
    assert.ok(!JSON.stringify(enriched.enrichment).includes('internal detail'));

    const pending = results[1];
    assert.ok(pending);
    assert.equal(pending.qualification.status, 'UNVERIFIED_SOCIAL');
    assert.equal(pending.enrichment, null);
  });

  it('preserves deterministic ordering from the repository', async () => {
    const rows = [
      makeRow({ id: 'first', ordering: 0 }),
      makeRow({ id: 'second', ordering: 1 }),
      makeRow({ id: 'third', ordering: 2 }),
    ];
    const useCase = new GetExecutionResultsUseCase(stubRepo(makeExecution(), rows));

    const { results } = await useCase.execute('exec-1', PRINCIPAL);

    assert.deepEqual(
      results.map((item) => item.resultId),
      ['first', 'second', 'third'],
    );
  });

  it('returns honest empty result set for execution without results', async () => {
    const useCase = new GetExecutionResultsUseCase(stubRepo(makeExecution(), []));
    const { results, count } = await useCase.execute('exec-1', PRINCIPAL);
    assert.deepEqual(results, []);
    assert.equal(count, 0);
  });

  it('recomputes qualification using legacy filters without intent', async () => {
    const rows = [makeRow()];
    const useCase = new GetExecutionResultsUseCase(
      stubRepo(makeExecution({ filters: { governorate: 'Cairo' } }), rows),
    );

    const { results } = await useCase.execute('exec-1', PRINCIPAL);

    assert.equal(results[0]?.qualification.status, 'QUALIFIED');
  });

  it('throws NotFoundException for unknown execution', async () => {
    const useCase = new GetExecutionResultsUseCase(stubRepo(null, []));
    await assert.rejects(() => useCase.execute('missing', PRINCIPAL), NotFoundException);
  });

  it('throws ForbiddenException for another user execution', async () => {
    const useCase = new GetExecutionResultsUseCase(stubRepo(makeExecution({ jobUserId: 'other' }), []));
    await assert.rejects(() => useCase.execute('exec-1', PRINCIPAL), ForbiddenException);
  });

  it('throws ForbiddenException when job owner is null', async () => {
    const useCase = new GetExecutionResultsUseCase(stubRepo(makeExecution({ jobUserId: null }), []));
    await assert.rejects(() => useCase.execute('exec-1', PRINCIPAL), ForbiddenException);
  });
});

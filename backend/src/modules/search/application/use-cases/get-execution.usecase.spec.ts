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
import { GetExecutionUseCase } from './get-execution.usecase.js';

const PRINCIPAL: AuthPrincipal = { userId: 'user-1', roles: ['MEMBER'], tokenType: 'access' };

function makeExecution(overrides: Partial<ExecutionDetailRow> = {}): ExecutionDetailRow {
  return {
    id: 'exec-1',
    jobId: 'job-1',
    status: 'COMPLETED',
    query: 'restaurants in Dublin',
    filters: { intent: { criteria: { website: 'ANY', social: 'ANY' } } },
    jobUserId: 'user-1',
    createdAt: new Date('2026-08-17T16:49:07.000Z'),
    finishedAt: new Date('2026-08-17T16:49:08.500Z'),
    metrics: { durationMs: 897 },
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
    area: null,
    phone: '0100',
    email: null,
    websiteDomain: 'test.com',
    rating: 4.5,
    ratingCount: 10,
    sourceUrl: null,
    verificationStatus: 'UNKNOWN',
    ordering: 0,
    retrievedAt: new Date('2026-08-17T16:49:08.009Z'),
    enrichmentStatus: 'PENDING',
    enrichmentSnapshot: null,
    enrichedAt: null,
    ...overrides,
  };
}

function enrichedSnapshot(): EnrichmentSnapshot {
  return {
    enrichedAt: '2026-08-17T16:50:38.000Z',
    enrichmentVersion: 1,
    website: {
      title: 'Test',
      description: null,
      techHints: [],
      socialLinks: [],
      fetchedAt: '2026-08-17T16:50:37.000Z',
      provider: 'http-website-enrichment',
    },
    social: {
      profiles: [
        { platform: 'facebook', handle: 'a', profileUrl: 'https://facebook.com/a', confidence: 0.9, verified: true },
        { platform: 'instagram', handle: 'b', profileUrl: 'https://instagram.com/b', confidence: 0.8, verified: false },
      ],
      discoveredAt: '2026-08-17T16:50:38.000Z',
      provider: 'http-social-discovery',
    },
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

describe('GetExecutionUseCase', () => {
  it('returns execution detail with recomputed summary for owner', async () => {
    const rows = [
      makeRow({
        id: 'r1',
        enrichmentStatus: 'ENRICHED',
        enrichmentSnapshot: enrichedSnapshot(),
        enrichedAt: new Date(),
      }),
      makeRow({ id: 'r2', enrichmentStatus: 'ENRICHMENT_FAILED' }),
      makeRow({ id: 'r3', enrichmentStatus: 'PENDING', websiteDomain: null }),
    ];
    const useCase = new GetExecutionUseCase(stubRepo(makeExecution(), rows));

    const detail = await useCase.execute('exec-1', PRINCIPAL);

    assert.equal(detail.executionId, 'exec-1');
    assert.equal(detail.jobId, 'job-1');
    assert.equal(detail.status, 'COMPLETED');
    assert.equal(detail.query, 'restaurants in Dublin');
    assert.equal(detail.createdAt, '2026-08-17T16:49:07.000Z');
    assert.equal(detail.finishedAt, '2026-08-17T16:49:08.500Z');
    assert.equal(detail.summary.total, 3);
    assert.equal(detail.summary.durationMs, 897);
    assert.equal(detail.summary.enrichmentDurationMs, null);
    assert.equal(detail.summary.enrichment.enriched, 1);
    assert.equal(detail.summary.enrichment.failed, 1);
    assert.equal(detail.summary.enrichment.pending, 1);
    assert.equal(detail.summary.enrichment.websiteFound, 1);
    assert.equal(detail.summary.enrichment.socialProfilesFound, 2);
    assert.equal(detail.summary.enrichment.socialProfilesVerified, 1);
  });

  it('counts qualification from recomputation including enrichment requalification', async () => {
    const filters = { intent: { criteria: { website: 'ANY', social: 'PRESENT' } } };
    const snapshot: EnrichmentSnapshot = {
      enrichedAt: '2026-08-17T16:50:38.000Z',
      enrichmentVersion: 1,
      social: {
        profiles: [
          { platform: 'facebook', handle: 'a', profileUrl: 'https://facebook.com/a', confidence: 0.9, verified: true },
        ],
        discoveredAt: '2026-08-17T16:50:38.000Z',
        provider: 'p',
      },
    };
    const rows = [
      makeRow({ id: 'qualified-via-enrichment', enrichmentStatus: 'ENRICHED', enrichmentSnapshot: snapshot }),
      makeRow({ id: 'still-unverified', enrichmentStatus: 'PENDING' }),
    ];
    const useCase = new GetExecutionUseCase(stubRepo(makeExecution({ filters }), rows));

    const detail = await useCase.execute('exec-1', PRINCIPAL);

    assert.equal(detail.summary.qualified, 1);
    assert.equal(detail.summary.unverifiedSocial, 1);
    assert.equal(detail.summary.rejected, 0);
  });

  it('returns honest empty summary for execution with no results', async () => {
    const useCase = new GetExecutionUseCase(stubRepo(makeExecution(), []));
    const detail = await useCase.execute('exec-1', PRINCIPAL);

    assert.equal(detail.summary.total, 0);
    assert.equal(detail.summary.qualified, 0);
    assert.equal(detail.summary.rejected, 0);
    assert.equal(detail.summary.unverifiedSocial, 0);
  });

  it('throws NotFoundException for unknown execution', async () => {
    const useCase = new GetExecutionUseCase(stubRepo(null, []));
    await assert.rejects(() => useCase.execute('missing', PRINCIPAL), NotFoundException);
  });

  it('throws ForbiddenException for another user execution (no null-bypass)', async () => {
    const useCase = new GetExecutionUseCase(stubRepo(makeExecution({ jobUserId: 'other-user' }), []));
    await assert.rejects(() => useCase.execute('exec-1', PRINCIPAL), ForbiddenException);
  });

  it('throws ForbiddenException when job has no owner (null userId)', async () => {
    const useCase = new GetExecutionUseCase(stubRepo(makeExecution({ jobUserId: null }), []));
    await assert.rejects(() => useCase.execute('exec-1', PRINCIPAL), ForbiddenException);
  });

  it('treats soft-deleted job as not found (repo resolves to null)', async () => {
    const useCase = new GetExecutionUseCase(stubRepo(null, []));
    await assert.rejects(() => useCase.execute('exec-1', PRINCIPAL), NotFoundException);
  });
});

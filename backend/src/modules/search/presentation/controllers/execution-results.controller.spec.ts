import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { ExecutionDetail } from '../../application/use-cases/get-execution.usecase.js';
import { GetExecutionUseCase } from '../../application/use-cases/get-execution.usecase.js';
import type { ExecutionResultItem } from '../../application/use-cases/get-execution-results.usecase.js';
import { GetExecutionResultsUseCase } from '../../application/use-cases/get-execution-results.usecase.js';
import { ExecutionResultsController } from './execution-results.controller.js';

const PRINCIPAL: AuthPrincipal = { userId: 'user-1', roles: ['MEMBER'], tokenType: 'access' };

function executionDetail(): ExecutionDetail {
  return {
    executionId: 'exec-1',
    jobId: 'job-1',
    status: 'COMPLETED',
    query: 'restaurants in Dublin',
    createdAt: '2026-08-17T16:49:07.000Z',
    finishedAt: '2026-08-17T16:49:08.500Z',
    summary: {
      total: 2,
      qualified: 1,
      rejected: 1,
      unverifiedSocial: 0,
      durationMs: 897,
      enrichmentDurationMs: 30135,
      enrichment: {
        pending: 0,
        inProgress: 0,
        enriched: 1,
        partiallyEnriched: 0,
        failed: 1,
        skipped: 0,
        websiteFound: 1,
        socialProfilesFound: 2,
        socialProfilesVerified: 1,
      },
    },
  };
}

function resultItem(): ExecutionResultItem {
  return {
    resultId: 'row-1',
    providerId: 'google-places',
    providerRecordId: 'rec-1',
    companyName: 'Test Business',
    category: 'restaurant',
    address: '1 Test St',
    area: null,
    phone: '0100',
    email: null,
    website: 'test.com',
    rating: 4.5,
    ratingCount: 10,
    sourceUrl: null,
    verificationStatus: 'UNKNOWN',
    retrievedAt: '2026-08-17T16:49:08.009Z',
    qualification: {
      status: 'QUALIFIED',
      reason: 'All discovery-level criteria satisfied',
      website: { requested: 'ANY', observed: 'PRESENT', source: 'google-places' },
      social: { requested: 'ANY', observed: 'UNKNOWN', source: null },
    },
    enrichment: {
      status: 'ENRICHED',
      enrichedAt: '2026-08-17T16:50:40.000Z',
      website: { title: 'Test', description: null, techHints: [], socialLinks: [] },
      social: { profiles: [] },
    },
  };
}

function controllerWith(overrides: { getExecution?: object; getResults?: object } = {}) {
  const getExecutionUseCase = { execute: async () => executionDetail(), ...overrides.getExecution };
  const getExecutionResultsUseCase = {
    execute: async () => ({ results: [resultItem()], count: 1 }),
    ...overrides.getResults,
  };
  return {
    controller: new ExecutionResultsController(
      getExecutionUseCase as unknown as GetExecutionUseCase,
      getExecutionResultsUseCase as unknown as GetExecutionResultsUseCase,
    ),
    getExecutionUseCase,
    getExecutionResultsUseCase,
  };
}

describe('ExecutionResultsController', () => {
  it('GET :executionId passes principal and id, returns detail DTO', async () => {
    const calls: Array<{ executionId: string; principal: AuthPrincipal }> = [];
    const { controller } = controllerWith({
      getExecution: {
        execute: async (executionId: string, principal: AuthPrincipal) => {
          calls.push({ executionId, principal });
          return executionDetail();
        },
      },
    });

    const result = await controller.getExecution(PRINCIPAL, 'exec-1');

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.executionId, 'exec-1');
    assert.equal(calls[0]?.principal.userId, 'user-1');
    assert.equal(result.executionId, 'exec-1');
    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.enrichment.enriched, 1);
  });

  it('GET :executionId/results passes principal and id, returns envelope DTO', async () => {
    const calls: Array<{ executionId: string; principal: AuthPrincipal }> = [];
    const { controller } = controllerWith({
      getResults: {
        execute: async (executionId: string, principal: AuthPrincipal) => {
          calls.push({ executionId, principal });
          return { results: [resultItem()], count: 1 };
        },
      },
    });

    const result = await controller.getResults(PRINCIPAL, 'exec-1');

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.executionId, 'exec-1');
    assert.equal(calls[0]?.principal.userId, 'user-1');
    assert.equal(result.data.length, 1);
    assert.equal(result.meta.count, 1);
    assert.equal(result.data[0]?.resultId, 'row-1');
    assert.equal(result.data[0]?.enrichment?.status, 'ENRICHED');
  });

  it('propagates NotFoundException from both endpoints', async () => {
    const { controller } = controllerWith({
      getExecution: { execute: async () => Promise.reject(new NotFoundException('not found')) },
      getResults: { execute: async () => Promise.reject(new NotFoundException('not found')) },
    });

    await assert.rejects(() => controller.getExecution(PRINCIPAL, 'missing'), NotFoundException);
    await assert.rejects(() => controller.getResults(PRINCIPAL, 'missing'), NotFoundException);
  });

  it('propagates ForbiddenException from both endpoints', async () => {
    const { controller } = controllerWith({
      getExecution: { execute: async () => Promise.reject(new ForbiddenException('forbidden')) },
      getResults: { execute: async () => Promise.reject(new ForbiddenException('forbidden')) },
    });

    await assert.rejects(() => controller.getExecution(PRINCIPAL, 'exec-1'), ForbiddenException);
    await assert.rejects(() => controller.getResults(PRINCIPAL, 'exec-1'), ForbiddenException);
  });

  it('returns empty data and count 0 for empty results', async () => {
    const { controller } = controllerWith({
      getResults: { execute: async () => ({ results: [], count: 0 }) },
    });

    const result = await controller.getResults(PRINCIPAL, 'exec-1');

    assert.deepEqual(result.data, []);
    assert.equal(result.meta.count, 0);
  });
});

import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { BusinessRuleException } from '../../../../common/exceptions/business-rule.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { EnrichmentRunResult } from '../../application/use-cases/enrich-search-results.usecase.js';
import { EnrichSearchResultsUseCase } from '../../application/use-cases/enrich-search-results.usecase.js';
import { EnrichController } from './enrich.controller.js';

const PRINCIPAL: AuthPrincipal = { userId: 'user-1', roles: ['MEMBER'], tokenType: 'access' };
const OTHER_PRINCIPAL: AuthPrincipal = { userId: 'user-2', roles: ['MEMBER'], tokenType: 'access' };

function enrichmentResult(overrides: Partial<EnrichmentRunResult> = {}): EnrichmentRunResult {
  return {
    executionId: 'exec-1',
    status: 'COMPLETED',
    summary: {
      total: 3,
      enriched: 2,
      partiallyEnriched: 1,
      failed: 0,
      skipped: 0,
      websiteFound: 2,
      socialProfilesFound: 3,
      socialProfilesVerified: 2,
    },
    durationMs: 1500,
    ...overrides,
  };
}

function controllerWith(overrides: Partial<Record<string, unknown>> = {}): EnrichController {
  const useCase = {
    execute: async () => enrichmentResult(),
  };
  return new EnrichController((overrides.useCase ?? useCase) as unknown as EnrichSearchResultsUseCase);
}

describe('EnrichController', () => {
  it('valid request reaches use case and returns DTO', async () => {
    const calls: Array<{ executionId: string; principal: AuthPrincipal; options: unknown }> = [];
    const useCase = {
      execute: async (input: { executionId: string; principal: AuthPrincipal; options: unknown }) => {
        calls.push({ executionId: input.executionId, principal: input.principal, options: input.options });
        return enrichmentResult();
      },
    };

    const controller = controllerWith({ useCase });
    const result = await controller.enrich(PRINCIPAL, 'exec-1', { skipWebsite: true });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].executionId, 'exec-1');
    assert.equal(calls[0].principal.userId, 'user-1');
    assert.deepEqual(calls[0].options, { skipWebsite: true });
    assert.equal(result.executionId, 'exec-1');
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.summary.total, 3);
    assert.equal(result.summary.enriched, 2);
    assert.equal(result.durationMs, 1500);
  });

  it('returns correct response structure', async () => {
    const controller = controllerWith();
    const result = await controller.enrich(PRINCIPAL, 'exec-1', {});

    assert.ok('executionId' in result);
    assert.ok('status' in result);
    assert.ok('summary' in result);
    assert.ok('durationMs' in result);
    assert.ok('enriched' in result.summary);
    assert.ok('partiallyEnriched' in result.summary);
    assert.ok('failed' in result.summary);
    assert.ok('skipped' in result.summary);
    assert.ok('websiteFound' in result.summary);
    assert.ok('socialProfilesFound' in result.summary);
    assert.ok('socialProfilesVerified' in result.summary);
  });

  it('execution not found throws NotFoundException', async () => {
    const useCase = {
      execute: async () => {
        throw new NotFoundException('Execution not found');
      },
    };
    const controller = controllerWith({ useCase });

    await assert.rejects(() => controller.enrich(PRINCIPAL, 'missing', {}), NotFoundException);
  });

  it('execution not completed throws BusinessRuleException', async () => {
    const useCase = {
      execute: async () => {
        throw new BusinessRuleException('ENRICHMENT_TARGET_NOT_READY', 'Execution must be COMPLETED');
      },
    };
    const controller = controllerWith({ useCase });

    await assert.rejects(() => controller.enrich(PRINCIPAL, 'exec-1', {}), BusinessRuleException);
  });

  it('execution belongs to another user throws BusinessRuleException', async () => {
    const useCase = {
      execute: async () => {
        throw new BusinessRuleException('FORBIDDEN', 'Execution belongs to another user');
      },
    };
    const controller = controllerWith({ useCase });

    await assert.rejects(() => controller.enrich(OTHER_PRINCIPAL, 'exec-1', {}), BusinessRuleException);
  });

  it('returns PARTIALLY_COMPLETED with correct summary', async () => {
    const useCase = {
      execute: async () =>
        enrichmentResult({
          status: 'PARTIALLY_COMPLETED',
          summary: {
            total: 5,
            enriched: 3,
            partiallyEnriched: 1,
            failed: 1,
            skipped: 0,
            websiteFound: 3,
            socialProfilesFound: 2,
            socialProfilesVerified: 1,
          },
        }),
    };
    const controller = controllerWith({ useCase });
    const result = await controller.enrich(PRINCIPAL, 'exec-1', {});

    assert.equal(result.status, 'PARTIALLY_COMPLETED');
    assert.equal(result.summary.total, 5);
    assert.equal(result.summary.enriched, 3);
    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.socialProfilesVerified, 1);
  });

  it('returns FAILED status when all results fail', async () => {
    const useCase = {
      execute: async () =>
        enrichmentResult({
          status: 'FAILED',
          summary: {
            total: 3,
            enriched: 0,
            partiallyEnriched: 0,
            failed: 3,
            skipped: 0,
            websiteFound: 0,
            socialProfilesFound: 0,
            socialProfilesVerified: 0,
          },
        }),
    };
    const controller = controllerWith({ useCase });
    const result = await controller.enrich(PRINCIPAL, 'exec-1', {});

    assert.equal(result.status, 'FAILED');
    assert.equal(result.summary.enriched, 0);
    assert.equal(result.summary.failed, 3);
  });

  it('passes all options to use case', async () => {
    let capturedOptions: unknown;
    const useCase = {
      execute: async (input: { options: unknown }) => {
        capturedOptions = input.options;
        return enrichmentResult();
      },
    };
    const controller = controllerWith({ useCase });

    await controller.enrich(PRINCIPAL, 'exec-1', {
      skipWebsite: true,
      skipSocial: true,
      concurrency: 3,
      maxRetries: 2,
    });

    assert.deepEqual(capturedOptions, {
      skipWebsite: true,
      skipSocial: true,
      concurrency: 3,
      maxRetries: 2,
    });
  });

  it('returns skipped summary for empty execution', async () => {
    const useCase = {
      execute: async () =>
        enrichmentResult({
          summary: {
            total: 0,
            enriched: 0,
            partiallyEnriched: 0,
            failed: 0,
            skipped: 0,
            websiteFound: 0,
            socialProfilesFound: 0,
            socialProfilesVerified: 0,
          },
        }),
    };
    const controller = controllerWith({ useCase });
    const result = await controller.enrich(PRINCIPAL, 'exec-1', {});

    assert.equal(result.summary.total, 0);
    assert.equal(result.status, 'COMPLETED');
  });
});

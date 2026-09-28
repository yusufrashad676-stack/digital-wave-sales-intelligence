import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../../../common/exceptions/error-codes.js';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { BusinessRuleException } from '../../../../common/exceptions/business-rule.exception.js';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { EnrichmentRepository } from '../../domain/ports/enrichment.repository.js';
import type { EnrichmentResultRow } from '../../domain/ports/enrichment.repository.js';
import { EnrichmentEngine, type EnrichmentTarget } from '../services/enrichment-engine.js';

const BATCH_DELAY_MS = 100;

export interface EnrichSearchResultsInput {
  executionId: string;
  principal: AuthPrincipal;
  options?: {
    skipWebsite?: boolean;
    skipSocial?: boolean;
    concurrency?: number;
    maxRetries?: number;
  };
}

export interface EnrichmentRunResult {
  executionId: string;
  status: 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
  summary: {
    total: number;
    enriched: number;
    partiallyEnriched: number;
    failed: number;
    skipped: number;
    websiteFound: number;
    socialProfilesFound: number;
    socialProfilesVerified: number;
  };
  durationMs: number;
}

@Injectable()
export class EnrichSearchResultsUseCase {
  private readonly logger = new Logger(EnrichSearchResultsUseCase.name);

  constructor(
    @Inject(EnrichmentRepository) private readonly enrichmentRepo: EnrichmentRepository,
    private readonly engine: EnrichmentEngine,
  ) {}

  async execute(input: EnrichSearchResultsInput): Promise<EnrichmentRunResult> {
    const startedAt = new Date();
    const { executionId, principal, options } = input;
    const skipWebsite = options?.skipWebsite ?? false;
    const skipSocial = options?.skipSocial ?? false;
    const concurrency = options?.concurrency ?? 5;

    // 1. Load execution and verify ownership + status
    const execution = await this.enrichmentRepo.findExecutionDetail(executionId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }
    if (execution.status !== 'COMPLETED') {
      throw new BusinessRuleException(
        ErrorCode.ENRICHMENT_TARGET_NOT_READY,
        `Execution must be COMPLETED before enrichment (current: ${execution.status})`,
      );
    }
    if (execution.jobUserId !== principal.userId) {
      throw new ForbiddenException('Execution belongs to another user');
    }

    // 2. Reset stale IN_PROGRESS results (crash recovery)
    await this.enrichmentRepo.resetStaleInProgress(executionId);

    // 3. Load results and filter to actionable statuses
    const allResults = await this.enrichmentRepo.findResultsByExecutionId(executionId);
    const actionable = allResults.filter(
      (r) => r.enrichmentStatus === 'PENDING' || r.enrichmentStatus === 'ENRICHMENT_FAILED',
    );

    if (actionable.length === 0) {
      const finishedAt = new Date();
      return {
        executionId,
        status: 'COMPLETED',
        summary: buildEmptySummary(allResults),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
    }

    // 4. Process results in batches
    const summary: EnrichmentRunResult['summary'] = {
      total: allResults.length,
      enriched: 0,
      partiallyEnriched: 0,
      failed: 0,
      skipped: 0,
      websiteFound: 0,
      socialProfilesFound: 0,
      socialProfilesVerified: 0,
    };

    const batchSize = Math.min(concurrency, actionable.length);
    for (let i = 0; i < actionable.length; i += batchSize) {
      const batch = actionable.slice(i, i + batchSize);
      const settled = await Promise.allSettled(
        batch.map((result) => this.enrichSingleResult(result, skipWebsite, skipSocial)),
      );

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          const { status, websiteFound, socialProfilesFound, socialProfilesVerified } = outcome.value;
          switch (status) {
            case 'ENRICHED':
              summary.enriched++;
              break;
            case 'PARTIALLY_ENRICHED':
              summary.partiallyEnriched++;
              break;
            case 'ENRICHMENT_FAILED':
              summary.failed++;
              break;
            case 'SKIPPED':
              summary.skipped++;
              break;
          }
          if (websiteFound) summary.websiteFound++;
          summary.socialProfilesFound += socialProfilesFound;
          summary.socialProfilesVerified += socialProfilesVerified;
        } else {
          // Should not happen — enrichSingleResult catches all errors
          summary.failed++;
          this.logger.error('Unexpected enrichment failure', outcome.reason);
        }
      }

      // Delay between batches to avoid overwhelming providers
      if (i + batchSize < actionable.length) {
        await delay(BATCH_DELAY_MS);
      }
    }

    // 5. Update execution metrics
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await this.enrichmentRepo.updateExecutionMetrics(executionId, {
      enrichmentDurationMs: durationMs,
      enrichedCount: summary.enriched,
      partiallyEnrichedCount: summary.partiallyEnriched,
      enrichmentFailedCount: summary.failed,
      enrichmentSkippedCount: summary.skipped,
      websiteFoundCount: summary.websiteFound,
      socialProfilesFoundCount: summary.socialProfilesFound,
      socialProfilesVerifiedCount: summary.socialProfilesVerified,
    });

    // 6. Determine overall status
    let overallStatus: EnrichmentRunResult['status'] = 'COMPLETED';
    if (summary.enriched === 0 && summary.partiallyEnriched === 0 && summary.failed > 0) {
      overallStatus = 'FAILED';
    } else if (summary.failed > 0 || summary.partiallyEnriched > 0) {
      overallStatus = 'PARTIALLY_COMPLETED';
    }

    return {
      executionId,
      status: overallStatus,
      summary,
      durationMs,
    };
  }

  private async enrichSingleResult(
    result: EnrichmentResultRow,
    skipWebsite: boolean,
    skipSocial: boolean,
  ): Promise<{
    status: string;
    websiteFound: boolean;
    socialProfilesFound: number;
    socialProfilesVerified: number;
  }> {
    // Mark as IN_PROGRESS
    await this.enrichmentRepo.updateEnrichmentStatus(result.id, 'IN_PROGRESS', null);

    const target: EnrichmentTarget = {
      websiteDomain: result.websiteDomain,
      companyName: result.companyName,
    };

    const engineResult = await this.engine.enrichSingleTarget(target, { skipWebsite, skipSocial });

    // Persist
    await this.enrichmentRepo.updateEnrichmentStatus(result.id, engineResult.status, engineResult.snapshot);

    return {
      status: engineResult.status,
      websiteFound: engineResult.websiteFound,
      socialProfilesFound: engineResult.socialProfilesFound,
      socialProfilesVerified: engineResult.socialProfilesVerified,
    };
  }
}

function buildEmptySummary(allResults: EnrichmentResultRow[]): EnrichmentRunResult['summary'] {
  return {
    total: allResults.length,
    enriched: 0,
    partiallyEnriched: 0,
    failed: 0,
    skipped: allResults.filter((r) => r.enrichmentStatus === 'SKIPPED').length,
    websiteFound: 0,
    socialProfilesFound: 0,
    socialProfilesVerified: 0,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '../../../../common/context/request-context.service.js';
import { ErrorCode } from '../../../../common/exceptions/error-codes.js';
import { ServiceUnavailableException } from '../../../../common/exceptions/service-unavailable.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import { SearchQuery } from '../../domain/entities/search-query.js';
import { translateArabicIntent } from '../services/arabic-intent-translator.js';
import { qualifyResults } from '../services/qualification-filter.js';
import type { DiscoveryRunResult, RunSummary } from '../../domain/entities/discovery-run.js';
import { SearchProviderPort } from '../../domain/ports/search-provider.port.js';
import { ImportSourceRepository } from '../../domain/ports/import-source.repository.js';
import { SearchExecutionRepository } from '../../domain/ports/search-execution.repository.js';
import { SearchJobRepository } from '../../domain/ports/search-job.repository.js';
import { SearchPersistenceRepository } from '../../domain/ports/search-persistence.repository.js';
import { normalizeProviderResult } from '../../infrastructure/normalization/normalize-provider-result.js';

const ERROR_COLUMN_LIMIT = 2000;
const DEFAULT_SAFETY_PAGE_LIMIT = 3;

@Injectable()
export class RunDiscoveryUseCase {
  private readonly logger = new Logger(RunDiscoveryUseCase.name);

  constructor(
    @Inject(SearchProviderPort) private readonly provider: SearchProviderPort,
    @Inject(ImportSourceRepository) private readonly importSources: ImportSourceRepository,
    @Inject(SearchJobRepository) private readonly jobs: SearchJobRepository,
    @Inject(SearchExecutionRepository) private readonly executions: SearchExecutionRepository,
    @Inject(SearchPersistenceRepository) private readonly persistence: SearchPersistenceRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async run(rawQuery: string, principal: AuthPrincipal): Promise<DiscoveryRunResult> {
    const startedAt = new Date();
    const intent = translateArabicIntent(rawQuery);

    const importSource = await this.importSources.findByCode(this.provider.providerId);
    if (importSource === null) {
      throw new ServiceUnavailableException(ErrorCode.SERVICE_UNAVAILABLE, 'Search provider is not configured', {
        provider: this.provider.providerId,
        reason: 'missing_import_source',
      });
    }

    const filters = {
      category: intent.discovery.category,
      governorate: intent.discovery.location.governorate,
      minRating: intent.discovery.minRating,
      intent,
    };

    const job = await this.jobs.createJob({
      query: rawQuery,
      filters,
      userId: principal.userId,
      status: 'RUNNING',
    });

    const correlationId = this.requestContext.getRequestId();
    const execution = await this.executions.createExecution({
      jobId: job.id,
      importSourceId: importSource.id,
      attempt: 1,
      trigger: 'MANUAL',
      status: 'RUNNING',
      providerRequest: { query: rawQuery, filters },
      correlationId,
      startedAt,
    });

    const allResults: NormalizedSearchResult[] = [];
    const seenIds = new Set<string>();
    let pagesRequested = 0;
    let totalProviderResults = 0;
    let duplicateCount = 0;
    let rawImportCount = 0;
    let currentPageToken: string | undefined;
    const targetQuantity = intent.opportunity.maxQuantity;

    try {
      while (pagesRequested < DEFAULT_SAFETY_PAGE_LIMIT) {
        pagesRequested++;

        const pageQuery = new SearchQuery(rawQuery, filters, currentPageToken);
        const resultSet = await this.provider.search(pageQuery);
        const retrievedAt = new Date();

        totalProviderResults += resultSet.results.length;

        const uniqueResults = resultSet.results.filter((result) => {
          if (seenIds.has(result.providerRecordId)) {
            duplicateCount++;
            return false;
          }
          seenIds.add(result.providerRecordId);
          return true;
        });

        const normalizedResults = uniqueResults.map((result) =>
          normalizeProviderResult(result, resultSet.providerId, retrievedAt),
        );

        await this.persistence.persistResultBatch({
          executionId: execution.id,
          importSourceId: importSource.id,
          providerId: resultSet.providerId,
          rawEvidence: resultSet.rawEvidence,
          rawFormat: `${resultSet.providerId}:json`,
          correlationId,
          results: normalizedResults,
          receivedAt: retrievedAt,
        });
        rawImportCount++;

        allResults.push(...normalizedResults);

        this.logger.debug(
          `Run ${job.id} page ${pagesRequested}: ${resultSet.results.length} raw, ` +
            `${uniqueResults.length} unique, ${allResults.length} total`,
        );

        if (!resultSet.nextPageToken) break;
        if (allResults.length >= targetQuantity) break;

        currentPageToken = resultSet.nextPageToken;
      }

      const qualifiedResults = qualifyResults(allResults, intent.criteria);

      const discovered = allResults.length;
      const qualified = qualifiedResults.filter((r) => r.qualification.status === 'QUALIFIED').length;
      const rejected = qualifiedResults.filter((r) => r.qualification.status === 'REJECTED').length;
      const unverifiedSocial = qualifiedResults.filter((r) => r.qualification.status === 'UNVERIFIED_SOCIAL').length;

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      await this.executions.markExecutionCompleted(execution.id, {
        finishedAt,
        metrics: {
          providerResultCount: totalProviderResults,
          rawImportCount,
          persistedResultCount: discovered,
          durationMs,
          pagesRequested,
          uniqueResultCount: discovered,
          duplicateResultCount: duplicateCount,
          discoveredCount: discovered,
          qualifiedCount: qualified,
          rejectedCount: rejected,
          unverifiedCount: unverifiedSocial,
        },
      });
      await this.jobs.markJobCompleted(job.id);

      const summary: RunSummary = {
        discovered,
        qualified,
        rejected,
        unverifiedSocial,
        pagesRequested,
        uniqueResults: discovered,
        duplicateResults: duplicateCount,
        durationMs,
      };

      return {
        runId: job.id,
        jobId: job.id,
        executionId: execution.id,
        status: 'COMPLETED',
        query: rawQuery,
        intent,
        summary,
        results: qualifiedResults,
      };
    } catch (error) {
      const finishedAt = new Date();
      await this.executions.markExecutionFailed(execution.id, {
        finishedAt,
        error: toSafeError(error),
      });
      await this.jobs.markJobFailed(job.id);
      throw error;
    }
  }
}

function toSafeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, ERROR_COLUMN_LIMIT);
}

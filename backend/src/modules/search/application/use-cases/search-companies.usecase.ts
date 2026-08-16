import { Inject, Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '../../../../common/context/request-context.service.js';
import { ErrorCode } from '../../../../common/exceptions/error-codes.js';
import { ServiceUnavailableException } from '../../../../common/exceptions/service-unavailable.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import { SearchQuery } from '../../domain/entities/search-query.js';
import { SearchProviderPort } from '../../domain/ports/search-provider.port.js';
import { ImportSourceRepository } from '../../domain/ports/import-source.repository.js';
import { SearchExecutionRepository } from '../../domain/ports/search-execution.repository.js';
import { SearchJobRepository } from '../../domain/ports/search-job.repository.js';
import { SearchPersistenceRepository } from '../../domain/ports/search-persistence.repository.js';
import { normalizeProviderResult } from '../../infrastructure/normalization/normalize-provider-result.js';

const ERROR_COLUMN_LIMIT = 2000;
const DEFAULT_SAFETY_PAGE_LIMIT = 3;

@Injectable()
export class SearchCompaniesUseCase {
  private readonly logger = new Logger(SearchCompaniesUseCase.name);

  constructor(
    @Inject(SearchProviderPort) private readonly provider: SearchProviderPort,
    @Inject(ImportSourceRepository) private readonly importSources: ImportSourceRepository,
    @Inject(SearchJobRepository) private readonly jobs: SearchJobRepository,
    @Inject(SearchExecutionRepository) private readonly executions: SearchExecutionRepository,
    @Inject(SearchPersistenceRepository) private readonly persistence: SearchPersistenceRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async search(query: SearchQuery, principal: AuthPrincipal): Promise<NormalizedSearchResult[]> {
    const startedAt = new Date();
    const importSource = await this.importSources.findByCode(this.provider.providerId);
    if (importSource === null) {
      throw new ServiceUnavailableException(ErrorCode.SERVICE_UNAVAILABLE, 'Search provider is not configured', {
        provider: this.provider.providerId,
        reason: 'missing_import_source',
      });
    }

    const job = await this.jobs.createJob({
      query: query.query,
      filters: query.filters,
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
      providerRequest: { query: query.query, filters: query.filters },
      correlationId,
      startedAt,
    });

    const allResults: NormalizedSearchResult[] = [];
    const seenIds = new Set<string>();
    let pagesRequested = 0;
    let totalProviderResults = 0;
    let duplicateCount = 0;
    let rawImportCount = 0;
    let currentPageToken: string | undefined = query.pageToken;
    const targetQuantity = query.targetQuantity ?? Number.POSITIVE_INFINITY;

    try {
      while (pagesRequested < DEFAULT_SAFETY_PAGE_LIMIT) {
        pagesRequested++;

        const pageQuery = new SearchQuery(query.query, query.filters, currentPageToken);
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
          `Page ${pagesRequested}: ${resultSet.results.length} raw, ${uniqueResults.length} unique, ` +
            `${allResults.length} total accumulated`,
        );

        if (!resultSet.nextPageToken) {
          break;
        }
        if (allResults.length >= targetQuantity) {
          break;
        }

        currentPageToken = resultSet.nextPageToken;
      }

      const finishedAt = new Date();
      await this.executions.markExecutionCompleted(execution.id, {
        finishedAt,
        metrics: {
          providerResultCount: totalProviderResults,
          rawImportCount,
          persistedResultCount: allResults.length,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          pagesRequested,
          uniqueResultCount: allResults.length,
          duplicateResultCount: duplicateCount,
        },
      });
      await this.jobs.markJobCompleted(job.id);

      return allResults;
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

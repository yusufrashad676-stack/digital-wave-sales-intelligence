import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { ExecutionResultRow } from '../../domain/ports/enrichment.repository.js';
import { EnrichmentRepository } from '../../domain/ports/enrichment.repository.js';
import type { ResultQualification } from '../../domain/entities/discovery-run.js';
import { computeQualification, extractCriteria } from '../services/execution-qualification.js';
import type { EnrichmentView } from '../../../../common/utils/enrichment-projection.util.js';
import { projectEnrichment } from '../../../../common/utils/enrichment-projection.util.js';

export interface ExecutionResultItem {
  resultId: string;
  providerId: string;
  providerRecordId: string;
  companyName: string;
  category: string | null;
  address: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  ratingCount: number | null;
  sourceUrl: string | null;
  verificationStatus: string;
  retrievedAt: string;
  qualification: ResultQualification;
  enrichment: EnrichmentView | null;
}

export interface ExecutionResults {
  results: ExecutionResultItem[];
  count: number;
}

@Injectable()
export class GetExecutionResultsUseCase {
  constructor(@Inject(EnrichmentRepository) private readonly enrichmentRepo: EnrichmentRepository) {}

  async execute(executionId: string, principal: AuthPrincipal): Promise<ExecutionResults> {
    const execution = await this.enrichmentRepo.findExecutionDetail(executionId);
    if (execution === null) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }
    if (execution.jobUserId !== principal.userId) {
      throw new ForbiddenException('Execution belongs to another user');
    }

    const rows = await this.enrichmentRepo.findFullResultsByExecutionId(executionId);
    const criteria = extractCriteria(execution.filters);

    const results = rows.map((row) => this.toItem(row, criteria));
    return { results, count: results.length };
  }

  private toItem(row: ExecutionResultRow, criteria: Parameters<typeof computeQualification>[1]): ExecutionResultItem {
    return {
      resultId: row.id,
      providerId: row.providerId,
      providerRecordId: row.providerRecordId,
      companyName: row.companyName,
      category: row.category,
      address: row.formattedAddress,
      area: row.area,
      phone: row.phone,
      email: row.email,
      website: row.websiteDomain,
      rating: row.rating,
      ratingCount: row.ratingCount,
      sourceUrl: row.sourceUrl,
      verificationStatus: row.verificationStatus,
      retrievedAt: row.retrievedAt.toISOString(),
      qualification: computeQualification(row, criteria),
      enrichment: projectEnrichment(row.enrichmentStatus, row.enrichmentSnapshot, row.enrichedAt),
    };
  }
}

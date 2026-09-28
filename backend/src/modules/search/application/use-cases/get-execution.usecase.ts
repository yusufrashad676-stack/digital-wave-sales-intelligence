import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { ExecutionResultRow } from '../../domain/ports/enrichment.repository.js';
import { EnrichmentRepository } from '../../domain/ports/enrichment.repository.js';
import { computeQualification, extractCriteria } from '../services/execution-qualification.js';

export interface ExecutionEnrichmentSummary {
  pending: number;
  inProgress: number;
  enriched: number;
  partiallyEnriched: number;
  failed: number;
  skipped: number;
  websiteFound: number;
  socialProfilesFound: number;
  socialProfilesVerified: number;
}

export interface ExecutionSummary {
  total: number;
  qualified: number;
  rejected: number;
  unverifiedSocial: number;
  durationMs: number | null;
  enrichmentDurationMs: number | null;
  enrichment: ExecutionEnrichmentSummary;
}

export interface ExecutionDetail {
  executionId: string;
  jobId: string;
  status: string;
  query: string;
  createdAt: string;
  finishedAt: string | null;
  summary: ExecutionSummary;
}

const ENRICHMENT_STATUS_COUNT_KEYS: Record<string, keyof ExecutionEnrichmentSummary> = {
  PENDING: 'pending',
  IN_PROGRESS: 'inProgress',
  ENRICHED: 'enriched',
  PARTIALLY_ENRICHED: 'partiallyEnriched',
  ENRICHMENT_FAILED: 'failed',
  SKIPPED: 'skipped',
};

const EMPTY_ENRICHMENT_SUMMARY: ExecutionEnrichmentSummary = {
  pending: 0,
  inProgress: 0,
  enriched: 0,
  partiallyEnriched: 0,
  failed: 0,
  skipped: 0,
  websiteFound: 0,
  socialProfilesFound: 0,
  socialProfilesVerified: 0,
};

function toOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildEnrichmentSummary(rows: ExecutionResultRow[]): ExecutionEnrichmentSummary {
  const summary: ExecutionEnrichmentSummary = { ...EMPTY_ENRICHMENT_SUMMARY };
  for (const row of rows) {
    const key = ENRICHMENT_STATUS_COUNT_KEYS[row.enrichmentStatus];
    if (key !== undefined) {
      summary[key]++;
    }
    if (row.enrichmentSnapshot?.website !== undefined) {
      summary.websiteFound++;
    }
    const profiles = row.enrichmentSnapshot?.social?.profiles ?? [];
    summary.socialProfilesFound += profiles.length;
    summary.socialProfilesVerified += profiles.filter((profile) => profile.verified).length;
  }
  return summary;
}

@Injectable()
export class GetExecutionUseCase {
  constructor(@Inject(EnrichmentRepository) private readonly enrichmentRepo: EnrichmentRepository) {}

  async execute(executionId: string, principal: AuthPrincipal): Promise<ExecutionDetail> {
    const execution = await this.enrichmentRepo.findExecutionDetail(executionId);
    if (execution === null) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }
    if (execution.jobUserId !== principal.userId) {
      throw new ForbiddenException('Execution belongs to another user');
    }

    const rows = await this.enrichmentRepo.findFullResultsByExecutionId(executionId);
    const criteria = extractCriteria(execution.filters);

    let qualified = 0;
    let rejected = 0;
    let unverifiedSocial = 0;
    for (const row of rows) {
      const qualification = computeQualification(row, criteria);
      if (qualification.status === 'QUALIFIED') {
        qualified++;
      } else if (qualification.status === 'REJECTED') {
        rejected++;
      } else {
        unverifiedSocial++;
      }
    }

    return {
      executionId: execution.id,
      jobId: execution.jobId,
      status: execution.status,
      query: execution.query,
      createdAt: execution.createdAt.toISOString(),
      finishedAt: execution.finishedAt === null ? null : execution.finishedAt.toISOString(),
      summary: {
        total: rows.length,
        qualified,
        rejected,
        unverifiedSocial,
        durationMs: toOptionalNumber(execution.metrics?.durationMs),
        enrichmentDurationMs: toOptionalNumber(execution.metrics?.enrichmentDurationMs),
        enrichment: buildEnrichmentSummary(rows),
      },
    };
  }
}

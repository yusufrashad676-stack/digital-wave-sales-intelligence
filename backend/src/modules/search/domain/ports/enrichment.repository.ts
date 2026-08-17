import type { EnrichmentSnapshot } from '../entities/enrichment-snapshot.js';

export const EnrichmentRepository = Symbol('EnrichmentRepository');

export interface EnrichmentResultRow {
  id: string;
  executionId: string;
  providerId: string;
  providerRecordId: string;
  companyName: string;
  websiteDomain: string | null;
  enrichmentStatus: string;
  enrichmentSnapshot: EnrichmentSnapshot | null;
}

export interface EnrichmentExecutionRow {
  id: string;
  jobId: string;
  status: string;
  createdById: string | null;
  metrics: Record<string, unknown> | null;
}

export interface EnrichmentRepository {
  findResultsByExecutionId(executionId: string): Promise<EnrichmentResultRow[]>;
  findExecutionById(executionId: string): Promise<EnrichmentExecutionRow | null>;
  updateEnrichmentStatus(searchResultId: string, status: string, snapshot: EnrichmentSnapshot | null): Promise<void>;
  resetStaleInProgress(executionId: string): Promise<number>;
  countByEnrichmentStatus(executionId: string): Promise<Record<string, number>>;
  updateExecutionMetrics(executionId: string, metrics: Record<string, unknown>): Promise<void>;
  acquireEnrichmentLock(executionId: string, userId: string): Promise<boolean>;
  releaseEnrichmentLock(executionId: string, userId: string): Promise<void>;
}

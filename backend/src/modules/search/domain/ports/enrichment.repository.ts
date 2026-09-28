import type { EnrichmentSnapshot } from '../entities/enrichment-snapshot.js';

export const EnrichmentRepository = Symbol('EnrichmentRepository');

export interface EnrichmentResultRow {
  id: string;
  executionId: string;
  providerId: string;
  providerRecordId: string;
  companyId: string | null;
  companyName: string;
  phone: string | null;
  email: string | null;
  websiteDomain: string | null;
  sourceUrl: string | null;
  retrievedAt: Date;
  enrichmentStatus: string;
  enrichmentSnapshot: EnrichmentSnapshot | null;
}

export interface ExecutionDetailRow {
  id: string;
  jobId: string;
  status: string;
  query: string;
  filters: Record<string, unknown> | null;
  jobUserId: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  metrics: Record<string, unknown> | null;
}

export interface ExecutionResultRow {
  id: string;
  executionId: string;
  providerId: string;
  providerRecordId: string;
  companyName: string;
  category: string | null;
  formattedAddress: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  websiteDomain: string | null;
  rating: number | null;
  ratingCount: number | null;
  sourceUrl: string | null;
  verificationStatus: string;
  ordering: number;
  retrievedAt: Date;
  enrichmentStatus: string;
  enrichmentSnapshot: EnrichmentSnapshot | null;
  enrichedAt: Date | null;
}

export interface EnrichmentRepository {
  findResultsByExecutionId(executionId: string): Promise<EnrichmentResultRow[]>;
  findExecutionDetail(executionId: string): Promise<ExecutionDetailRow | null>;
  findFullResultsByExecutionId(executionId: string): Promise<ExecutionResultRow[]>;
  updateEnrichmentStatus(searchResultId: string, status: string, snapshot: EnrichmentSnapshot | null): Promise<void>;
  resetStaleInProgress(executionId: string): Promise<number>;
  countByEnrichmentStatus(executionId: string): Promise<Record<string, number>>;
  updateExecutionMetrics(executionId: string, metrics: Record<string, unknown>): Promise<void>;
  acquireEnrichmentLock(executionId: string, userId: string): Promise<boolean>;
  releaseEnrichmentLock(executionId: string, userId: string): Promise<void>;
}

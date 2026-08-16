import type { CriteriaValue, SearchIntent } from './search-intent.js';

export type RunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type QualificationStatus = 'QUALIFIED' | 'UNVERIFIED_SOCIAL' | 'REJECTED';
export type ObservedValue = 'PRESENT' | 'ABSENT' | 'UNKNOWN';

export interface QualificationSignal {
  requested: CriteriaValue;
  observed: ObservedValue;
  source: string | null;
}

export interface ResultQualification {
  website: QualificationSignal;
  social: QualificationSignal;
  status: QualificationStatus;
  reason: string;
}

export interface QualifiedResult {
  providerId: string;
  providerRecordId: string;
  companyName: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  ratingCount: number | null;
  sourceUrl: string | null;
  qualification: ResultQualification;
}

export interface RunSummary {
  discovered: number;
  qualified: number;
  rejected: number;
  unverifiedSocial: number;
  pagesRequested: number;
  uniqueResults: number;
  duplicateResults: number;
  durationMs: number;
}

export interface DiscoveryRunResult {
  runId: string;
  jobId: string;
  executionId: string;
  status: RunStatus;
  query: string;
  intent: SearchIntent;
  summary: RunSummary;
  results: QualifiedResult[];
}

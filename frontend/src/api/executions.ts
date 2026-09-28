import { requestJson } from './request';

export interface EnrichmentCounts {
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
  enrichment: EnrichmentCounts;
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

export interface ResultQualification {
  status: 'QUALIFIED' | 'UNVERIFIED_SOCIAL' | 'REJECTED';
  reason: string;
  website: { requested: string; observed: string; source: string | null };
  social: { requested: string; observed: string; source: string | null };
}

export interface SocialProfile {
  platform: string;
  handle: string;
  profileUrl: string | null;
  confidence: number;
  verified: boolean;
}

export interface WebsiteEnrichment {
  title: string | null;
  description: string | null;
  techHints: string[];
  socialLinks: string[];
}

export interface SocialEnrichment {
  profiles: SocialProfile[];
}

export interface EnrichmentView {
  status: string;
  enrichedAt: string | null;
  website: WebsiteEnrichment | null;
  social: SocialEnrichment | null;
}

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
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';
  retrievedAt: string;
  qualification: ResultQualification;
  enrichment: EnrichmentView | null;
}

export interface EnrichmentSummary {
  total: number;
  enriched: number;
  partiallyEnriched: number;
  failed: number;
  skipped: number;
  websiteFound: number;
  socialProfilesFound: number;
  socialProfilesVerified: number;
}

export interface EnrichExecutionResult {
  executionId: string;
  status: 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
  summary: EnrichmentSummary;
  durationMs: number;
}

export function getExecution(executionId: string, opts?: Parameters<typeof requestJson>[2]) {
  return requestJson<{ data: ExecutionDetail }>(
    `${import.meta.env.VITE_API_URL ?? ''}/api/v1/search/executions/${encodeURIComponent(executionId)}`,
    { headers: { 'Content-Type': 'application/json' } },
    opts,
  );
}

export function getExecutionResults(executionId: string, opts?: Parameters<typeof requestJson>[2]) {
  return requestJson<{ data: ExecutionResultItem[]; meta: { count: number } }>(
    `${import.meta.env.VITE_API_URL ?? ''}/api/v1/search/executions/${encodeURIComponent(executionId)}/results`,
    { headers: { 'Content-Type': 'application/json' } },
    opts,
  );
}

export function enrichExecution(
  executionId: string,
  body?: { skipWebsite?: boolean; skipSocial?: boolean; concurrency?: number; maxRetries?: number },
  opts?: Parameters<typeof requestJson>[2],
) {
  return requestJson<{ data: EnrichExecutionResult }>(
    `${import.meta.env.VITE_API_URL ?? ''}/api/v1/search/executions/${encodeURIComponent(executionId)}/enrich`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    },
    opts,
  );
}

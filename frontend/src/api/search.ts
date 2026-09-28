import { requestJson } from './request';

export interface SearchFilters {
  governorate?: string;
  category?: string;
  minRating?: number;
  verifiedOnly?: boolean;
}

export interface SearchResult {
  providerId: string;
  providerRecordId: string;
  companyName: string;
  category: string | null;
  address: string | null;
  area: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  ratingCount: number | null;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';
  sourceUrl: string | null;
  retrievedAt: string;
}

export interface RunSearchResponse {
  runId: string;
  jobId: string;
  executionId: string;
  status: string;
  query: string;
  results: RunResultItem[];
  summary: RunSummary;
}

export interface RunResultItem {
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
  qualification: {
    status: 'QUALIFIED' | 'UNVERIFIED_SOCIAL' | 'REJECTED';
    reason: string;
    website: { requested: string; observed: string; source: string | null };
    social: { requested: string; observed: string; source: string | null };
  };
}

export interface RunSummary {
  discovered: number;
  qualified: number;
  rejected: number;
  unverifiedSocial: number;
  durationMs: number;
}

export interface SearchResponse {
  data: SearchResult[];
  meta: { count: number };
}

export interface SearchHistoryItem {
  id: string;
  executionId: string | null;
  query: string;
  filters: SearchFilters;
  status: string;
  resultCount: number;
  executedAt: string | null;
  createdAt: string;
}

export interface SearchHistoryResponse {
  data: SearchHistoryItem[];
  meta: { count: number };
}

function qualificationToVerification(
  q: RunResultItem['qualification'],
): 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN' {
  if (q.status === 'QUALIFIED') return 'VERIFIED';
  if (q.status === 'UNVERIFIED_SOCIAL') return 'UNVERIFIED';
  return 'UNKNOWN';
}

function runResultToSearchResult(item: RunResultItem): SearchResult {
  return {
    providerId: item.providerId,
    providerRecordId: item.providerRecordId,
    companyName: item.companyName,
    category: item.category,
    address: item.address,
    area: null,
    phone: item.phone,
    website: item.website,
    rating: item.rating,
    ratingCount: item.ratingCount,
    verificationStatus: qualificationToVerification(item.qualification),
    sourceUrl: item.sourceUrl,
    retrievedAt: new Date().toISOString(),
  };
}

export interface SearchRunResult {
  executionId: string;
  results: SearchResult[];
  summary: RunSummary;
}

const ENDPOINT = '/api/v1/search';

export async function searchBusinesses(query: string, filters: SearchFilters): Promise<SearchRunResult> {
  const response = await requestJson<RunSearchResponse>(`${ENDPOINT}/runs`, {
    method: 'POST',
    body: JSON.stringify({ query, ...filters }),
  });
  return {
    executionId: response.executionId,
    results: response.results.map(runResultToSearchResult),
    summary: response.summary,
  };
}

export async function fetchSearchHistory(): Promise<SearchHistoryResponse> {
  return requestJson<SearchHistoryResponse>(`${ENDPOINT}/history`, { method: 'GET' });
}

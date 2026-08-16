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

export interface SearchResponse {
  data: SearchResult[];
  meta: { count: number };
}

export interface SearchHistoryItem {
  id: string;
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

const ENDPOINT = '/api/v1/search';

export async function searchBusinesses(query: string, filters: SearchFilters): Promise<SearchResponse> {
  return requestJson<SearchResponse>(ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({ query, ...filters }),
  });
}

export async function fetchSearchHistory(): Promise<SearchHistoryResponse> {
  return requestJson<SearchHistoryResponse>(`${ENDPOINT}/history`, { method: 'GET' });
}

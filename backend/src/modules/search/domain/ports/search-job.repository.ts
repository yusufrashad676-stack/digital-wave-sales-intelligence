import type { SearchFilters } from '../entities/search-query.js';

export type SearchJobStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED';

export interface SearchJobSnapshot {
  id: string;
}

export interface SearchJobHistoryItem {
  id: string;
  query: string;
  filters: SearchFilters;
  status: SearchJobStatus;
  resultCount: number;
  executedAt: string | null;
  createdAt: string;
}

export interface CreateSearchJobInput {
  query: string;
  filters: SearchFilters;
  userId: string;
  status: SearchJobStatus;
}

export const SearchJobRepository = Symbol('SearchJobRepository');

export interface SearchJobRepository {
  createJob(input: CreateSearchJobInput): Promise<SearchJobSnapshot>;
  markJobCompleted(id: string): Promise<void>;
  markJobFailed(id: string): Promise<void>;
  findRecentByUser(userId: string, limit: number): Promise<SearchJobHistoryItem[]>;
}

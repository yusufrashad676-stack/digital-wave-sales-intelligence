import type { NormalizedSearchResult } from '../entities/normalized-search-result.js';

export interface PersistResultBatchInput {
  executionId: string;
  importSourceId: string;
  providerId: string;
  rawEvidence: unknown;
  rawFormat: string;
  correlationId: string;
  results: NormalizedSearchResult[];
  receivedAt: Date;
}

export const SearchPersistenceRepository = Symbol('SearchPersistenceRepository');

export interface SearchPersistenceRepository {
  persistResultBatch(input: PersistResultBatchInput): Promise<void>;
}

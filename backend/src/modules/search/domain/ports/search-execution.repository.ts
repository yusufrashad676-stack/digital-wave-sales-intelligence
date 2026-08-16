export type SearchExecutionStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED';

export type SearchExecutionTrigger = 'MANUAL' | 'SCHEDULE' | 'WORKFLOW';

export interface SearchExecutionSnapshot {
  id: string;
}

export interface SearchExecutionMetrics {
  providerResultCount: number;
  rawImportCount: number;
  persistedResultCount: number;
  durationMs: number;
  pagesRequested?: number;
  uniqueResultCount?: number;
  duplicateResultCount?: number;
}

export interface CreateSearchExecutionInput {
  jobId: string;
  importSourceId: string;
  attempt: number;
  trigger: SearchExecutionTrigger;
  status: SearchExecutionStatus;
  providerRequest: unknown;
  correlationId: string;
  startedAt: Date;
}

export interface CompleteSearchExecutionInput {
  finishedAt: Date;
  metrics: SearchExecutionMetrics;
}

export interface FailSearchExecutionInput {
  finishedAt: Date;
  error: string;
}

export const SearchExecutionRepository = Symbol('SearchExecutionRepository');

export interface SearchExecutionRepository {
  createExecution(input: CreateSearchExecutionInput): Promise<SearchExecutionSnapshot>;
  markExecutionCompleted(id: string, input: CompleteSearchExecutionInput): Promise<void>;
  markExecutionFailed(id: string, input: FailSearchExecutionInput): Promise<void>;
}

import { Inject, Injectable } from '@nestjs/common';
import type { SearchJobHistoryItem } from '../../domain/ports/search-job.repository.js';
import { SearchJobRepository } from '../../domain/ports/search-job.repository.js';

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 100;

@Injectable()
export class GetSearchHistoryUseCase {
  constructor(@Inject(SearchJobRepository) private readonly jobs: SearchJobRepository) {}

  async getHistory(userId: string, limit: number = DEFAULT_HISTORY_LIMIT): Promise<SearchJobHistoryItem[]> {
    const bounded = Math.min(Math.max(limit, 1), MAX_HISTORY_LIMIT);
    return this.jobs.findRecentByUser(userId, bounded);
  }
}

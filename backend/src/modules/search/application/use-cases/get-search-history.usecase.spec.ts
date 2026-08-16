import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SearchJobHistoryItem, SearchJobRepository } from '../../domain/ports/search-job.repository.js';
import { DEFAULT_HISTORY_LIMIT, GetSearchHistoryUseCase } from './get-search-history.usecase.js';

function historyItem(overrides: Partial<SearchJobHistoryItem> = {}): SearchJobHistoryItem {
  return {
    id: 'job-1',
    query: 'عيادات',
    filters: {},
    status: 'COMPLETED',
    resultCount: 2,
    executedAt: '2026-08-10T10:05:00.000Z',
    createdAt: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

function useCaseWith(
  records: SearchJobHistoryItem[],
  calls: { userIds: string[]; limits: number[] },
): GetSearchHistoryUseCase {
  const jobs = {
    findRecentByUser: async (userId: string, limit: number) => {
      calls.userIds.push(userId);
      calls.limits.push(limit);
      return records;
    },
  } as unknown as SearchJobRepository;
  return new GetSearchHistoryUseCase(jobs);
}

describe('GetSearchHistoryUseCase', () => {
  it('returns recent jobs for the given user with the default limit', async () => {
    const calls = { userIds: [], limits: [] };
    const useCase = useCaseWith([historyItem()], calls);

    const items = await useCase.getHistory('user-1');

    assert.equal(items.length, 1);
    assert.equal(items[0]?.id, 'job-1');
    assert.deepEqual(calls.userIds, ['user-1']);
    assert.deepEqual(calls.limits, [DEFAULT_HISTORY_LIMIT]);
  });

  it('honours an explicit limit', async () => {
    const calls = { userIds: [], limits: [] };
    const useCase = useCaseWith([], calls);

    await useCase.getHistory('user-1', 5);

    assert.deepEqual(calls.limits, [5]);
  });

  it('clamps the limit to the allowed range', async () => {
    const calls = { userIds: [], limits: [] };
    const useCase = useCaseWith([], calls);

    await useCase.getHistory('user-1', 0);
    await useCase.getHistory('user-1', 5000);

    assert.deepEqual(calls.limits, [1, 100]);
  });
});

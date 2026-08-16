import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import type { SearchJobHistoryItem } from '../../domain/ports/search-job.repository.js';
import { GetSearchHistoryUseCase } from '../../application/use-cases/get-search-history.usecase.js';
import { SearchCompaniesUseCase } from '../../application/use-cases/search-companies.usecase.js';
import { SearchController } from './search.controller.js';
import type { SearchRequestDto } from '../dto/search-request.dto.js';

const PRINCIPAL: AuthPrincipal = { userId: 'user-1', roles: ['MEMBER'], tokenType: 'access' };

function sampleResult(): NormalizedSearchResult {
  return new NormalizedSearchResult(
    'mock',
    'mock-clinic-001',
    'عيادة د. أحمد لطب الأسنان',
    'dental-clinic',
    'التجمع الخامس، شارع التسعين',
    '+201001234567',
    'https://www.example.com',
    4.6,
    128,
    'VERIFIED',
    'https://maps.example.com/place/mock-clinic-001',
    new Date('2026-08-10T10:00:00.000Z'),
    'التجمع الخامس',
  );
}

function controllerWith(results: NormalizedSearchResult[]): SearchController {
  const useCase = { search: async () => results } as unknown as SearchCompaniesUseCase;
  const historyUseCase = { getHistory: async () => [] } as unknown as GetSearchHistoryUseCase;
  return new SearchController(useCase, historyUseCase);
}

function historyItem(overrides: Partial<SearchJobHistoryItem> = {}): SearchJobHistoryItem {
  return {
    id: 'job-1',
    query: 'عيادات',
    filters: { category: 'clinic' },
    status: 'COMPLETED',
    resultCount: 2,
    executedAt: '2026-08-10T10:05:00.000Z',
    createdAt: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('SearchController', () => {
  it('returns an envelope with data and meta', async () => {
    const response = await controllerWith([sampleResult()]).search(PRINCIPAL, { query: 'عيادات' } as SearchRequestDto);

    assert.equal(response.meta.count, 1);
    assert.equal(response.data.length, 1);
    assert.ok('data' in response && 'meta' in response);
  });

  it('exposes only normalized, provider-agnostic fields', async () => {
    const response = await controllerWith([sampleResult()]).search(PRINCIPAL, { query: 'عيادات' } as SearchRequestDto);
    const item = response.data[0];

    assert.deepEqual(Object.keys(item).sort(), [
      'address',
      'area',
      'category',
      'companyName',
      'phone',
      'providerId',
      'providerRecordId',
      'rating',
      'ratingCount',
      'retrievedAt',
      'sourceUrl',
      'verificationStatus',
      'website',
    ]);
    assert.equal(item.providerId, 'mock');
    assert.equal(item.companyName, 'عيادة د. أحمد لطب الأسنان');
    assert.equal(item.verificationStatus, 'VERIFIED');
    assert.equal(item.retrievedAt, '2026-08-10T10:00:00.000Z');
  });

  it('returns an empty data array with count zero for no results', async () => {
    const response = await controllerWith([]).search(PRINCIPAL, {
      query: 'لا يوجد',
      category: 'pharmacy',
    } as SearchRequestDto);
    assert.deepEqual(response.data, []);
    assert.equal(response.meta.count, 0);
  });

  it('returns the user recent searches envelope', async () => {
    const useCase = { search: async () => [] } as unknown as SearchCompaniesUseCase;
    const historyUseCase = { getHistory: async () => [historyItem()] } as unknown as GetSearchHistoryUseCase;
    const controller = new SearchController(useCase, historyUseCase);

    const response = await controller.history(PRINCIPAL);

    assert.equal(response.meta.count, 1);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0]?.id, 'job-1');
    assert.equal(response.data[0]?.query, 'عيادات');
    assert.equal(response.data[0]?.status, 'COMPLETED');
    assert.equal(response.data[0]?.resultCount, 2);
    assert.equal(response.data[0]?.executedAt, '2026-08-10T10:05:00.000Z');
  });
});

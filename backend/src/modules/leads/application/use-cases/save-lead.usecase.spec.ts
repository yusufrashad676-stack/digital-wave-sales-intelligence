import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LeadRepository } from '../../domain/ports/lead.repository.js';
import { leadSnapshot } from './lead-snapshot.fixture.js';
import { SaveLeadUseCase } from './save-lead.usecase.js';

describe('SaveLeadUseCase', () => {
  it('persists the snapshot for the given user', async () => {
    const calls: Array<{ userId: string; input: unknown }> = [];
    const repository = {
      save: async (userId: string, input: unknown) => {
        calls.push({ userId, input });
        return leadSnapshot();
      },
    } as unknown as LeadRepository;

    const useCase = new SaveLeadUseCase(repository);
    const input = {
      providerId: 'mock',
      providerRecordId: 'mock-restaurant-003',
      companyName: 'مطعم أبو قير للمأكولات البحرية',
      retrievedAt: '2026-08-15T10:00:00.000Z',
    };

    const result = await useCase.save('user-1', input);

    assert.equal(result.id, 'lead-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.userId, 'user-1');
    assert.deepEqual(calls[0]?.input, input);
  });
});

import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LeadRepository } from '../../domain/ports/lead.repository.js';
import { ListSavedLeadsUseCase } from './list-saved-leads.usecase.js';
import { leadSnapshot } from './lead-snapshot.fixture.js';

describe('ListSavedLeadsUseCase', () => {
  it('returns the user leads from the repository', async () => {
    const calls: string[] = [];
    const repository = {
      listByUser: async (userId: string) => {
        calls.push(userId);
        return [leadSnapshot()];
      },
    } as unknown as LeadRepository;

    const result = await new ListSavedLeadsUseCase(repository).list('user-1');

    assert.equal(result.length, 1);
    assert.deepEqual(calls, ['user-1']);
  });
});

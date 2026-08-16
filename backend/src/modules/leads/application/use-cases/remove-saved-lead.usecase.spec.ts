import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { LeadRepository } from '../../domain/ports/lead.repository.js';
import { RemoveSavedLeadUseCase } from './remove-saved-lead.usecase.js';

describe('RemoveSavedLeadUseCase', () => {
  it('removes an owned lead', async () => {
    const calls: Array<{ userId: string; leadId: string }> = [];
    const repository = {
      remove: async (userId: string, leadId: string) => {
        calls.push({ userId, leadId });
        return true;
      },
    } as unknown as LeadRepository;

    await new RemoveSavedLeadUseCase(repository).remove('user-1', 'lead-1');

    assert.deepEqual(calls, [{ userId: 'user-1', leadId: 'lead-1' }]);
  });

  it('throws NotFound when the lead is not owned', async () => {
    const repository = { remove: async () => false } as unknown as LeadRepository;
    await assert.rejects(() => new RemoveSavedLeadUseCase(repository).remove('user-1', 'missing'), NotFoundException);
  });
});

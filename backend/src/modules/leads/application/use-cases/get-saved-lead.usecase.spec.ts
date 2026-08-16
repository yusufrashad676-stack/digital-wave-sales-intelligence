import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { LeadRepository } from '../../domain/ports/lead.repository.js';
import { GetSavedLeadUseCase } from './get-saved-lead.usecase.js';
import { leadSnapshot } from './lead-snapshot.fixture.js';

describe('GetSavedLeadUseCase', () => {
  it('returns the owned lead when it exists', async () => {
    const repository = { findOwned: async () => leadSnapshot() } as unknown as LeadRepository;
    const result = await new GetSavedLeadUseCase(repository).get('user-1', 'lead-1');
    assert.equal(result.id, 'lead-1');
  });

  it('throws NotFound when the lead is not owned', async () => {
    const repository = { findOwned: async () => null } as unknown as LeadRepository;
    await assert.rejects(() => new GetSavedLeadUseCase(repository).get('user-1', 'missing'), NotFoundException);
  });
});

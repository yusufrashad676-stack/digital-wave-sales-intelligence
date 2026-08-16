import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { LeadRepository } from '../../domain/ports/lead.repository.js';
import { UpdateSavedLeadUseCase } from './update-saved-lead.usecase.js';
import { leadSnapshot } from './lead-snapshot.fixture.js';

describe('UpdateSavedLeadUseCase', () => {
  it('updates status and notes for an owned lead', async () => {
    const calls: Array<{ userId: string; leadId: string; patch: unknown }> = [];
    const repository = {
      update: async (userId: string, leadId: string, patch: unknown) => {
        calls.push({ userId, leadId, patch });
        return leadSnapshot({ status: 'CONTACTED', notes: 'تمت المكالمة' });
      },
    } as unknown as LeadRepository;

    const result = await new UpdateSavedLeadUseCase(repository).update('user-1', 'lead-1', {
      status: 'CONTACTED',
      notes: 'تمت المكالمة',
    });

    assert.equal(result.status, 'CONTACTED');
    assert.equal(result.notes, 'تمت المكالمة');
    assert.deepEqual(calls[0], {
      userId: 'user-1',
      leadId: 'lead-1',
      patch: { status: 'CONTACTED', notes: 'تمت المكالمة' },
    });
  });

  it('throws NotFound when the lead is not owned', async () => {
    const repository = { update: async () => null } as unknown as LeadRepository;
    await assert.rejects(
      () => new UpdateSavedLeadUseCase(repository).update('user-1', 'missing', { status: 'QUALIFIED' }),
      NotFoundException,
    );
  });
});

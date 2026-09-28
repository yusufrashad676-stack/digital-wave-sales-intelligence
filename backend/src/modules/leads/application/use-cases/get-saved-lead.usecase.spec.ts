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
    assert.equal(result.enrichmentStatus, 'PENDING');
    assert.equal(result.enrichmentSnapshot, null);
    assert.equal(result.enrichedAt, null);
  });

  it('carries enrichment state through for an enriched lead', async () => {
    const repository = {
      findOwned: async () =>
        leadSnapshot({
          enrichmentStatus: 'PARTIALLY_ENRICHED',
          enrichmentSnapshot: { website: { title: 'T', description: null, techHints: [], socialLinks: [] } },
          enrichedAt: '2026-08-17T16:50:40.000Z',
        }),
    } as unknown as LeadRepository;

    const result = await new GetSavedLeadUseCase(repository).get('user-1', 'lead-1');

    assert.equal(result.enrichmentStatus, 'PARTIALLY_ENRICHED');
    assert.equal(result.enrichmentSnapshot?.website?.title, 'T');
    assert.equal(result.enrichedAt, '2026-08-17T16:50:40.000Z');
  });

  it('throws NotFound when the lead is not owned', async () => {
    const repository = { findOwned: async () => null } as unknown as LeadRepository;
    await assert.rejects(() => new GetSavedLeadUseCase(repository).get('user-1', 'missing'), NotFoundException);
  });
});

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
    assert.equal(result[0]?.enrichmentStatus, 'PENDING');
    assert.equal(result[0]?.enrichmentSnapshot, null);
    assert.equal(result[0]?.enrichedAt, null);
  });

  it('carries enrichment state through from the repository', async () => {
    const repository = {
      listByUser: async () => [
        leadSnapshot({
          enrichmentStatus: 'ENRICHED',
          enrichmentSnapshot: { website: { title: 'T', description: null, techHints: [], socialLinks: [] } },
          enrichedAt: '2026-08-17T16:50:40.000Z',
        }),
      ],
    } as unknown as LeadRepository;

    const result = await new ListSavedLeadsUseCase(repository).list('user-1');

    assert.equal(result[0]?.enrichmentStatus, 'ENRICHED');
    assert.equal(result[0]?.enrichmentSnapshot?.website?.title, 'T');
    assert.equal(result[0]?.enrichedAt, '2026-08-17T16:50:40.000Z');
  });
});

import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { ConflictException } from '../../../../common/exceptions/conflict.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { GetSavedLeadUseCase } from '../../application/use-cases/get-saved-lead.usecase.js';
import { leadSnapshot } from '../../application/use-cases/lead-snapshot.fixture.js';
import { ListSavedLeadsUseCase } from '../../application/use-cases/list-saved-leads.usecase.js';
import { RemoveSavedLeadUseCase } from '../../application/use-cases/remove-saved-lead.usecase.js';
import { SaveLeadUseCase } from '../../application/use-cases/save-lead.usecase.js';
import { UpdateSavedLeadUseCase } from '../../application/use-cases/update-saved-lead.usecase.js';
import { EnrichLeadUseCase } from '../../application/use-cases/enrich-lead.usecase.js';
import { LeadsController } from './leads.controller.js';

const PRINCIPAL: AuthPrincipal = { userId: 'user-1', roles: ['MEMBER'], tokenType: 'access' };

function controllerWith(overrides: Partial<Record<string, unknown>> = {}): LeadsController {
  const save = { save: async () => leadSnapshot() };
  const list = { list: async () => [leadSnapshot()] };
  const get = { get: async () => leadSnapshot() };
  const update = { update: async () => leadSnapshot({ status: 'QUALIFIED' }) };
  const remove = { remove: async () => undefined };
  const enrich = { enrich: async () => ({ lead: leadSnapshot({ enrichmentStatus: 'ENRICHED' }), durationMs: 42 }) };
  return new LeadsController(
    (overrides.save ?? save) as unknown as SaveLeadUseCase,
    (overrides.list ?? list) as unknown as ListSavedLeadsUseCase,
    (overrides.get ?? get) as unknown as GetSavedLeadUseCase,
    (overrides.update ?? update) as unknown as UpdateSavedLeadUseCase,
    (overrides.remove ?? remove) as unknown as RemoveSavedLeadUseCase,
    (overrides.enrich ?? enrich) as unknown as EnrichLeadUseCase,
  );
}

describe('LeadsController', () => {
  it('saves a lead from a validated payload', async () => {
    const response = await controllerWith().save(PRINCIPAL, {
      providerId: 'mock',
      providerRecordId: 'mock-restaurant-003',
      companyName: 'مطعم أبو قير للمأكولات البحرية',
      retrievedAt: '2026-08-15T10:00:00.000Z',
    });

    assert.equal(response.id, 'lead-1');
    assert.equal(response.status, 'NEW');
    assert.equal(response.companyName, 'مطعم أبو قير للمأكولات البحرية');
    assert.equal(response.retrievedAt, '2026-08-15T10:00:00.000Z');
  });

  it('lists leads with an envelope', async () => {
    const response = await controllerWith().list(PRINCIPAL);
    assert.equal(response.meta.count, 1);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0]?.id, 'lead-1');
  });

  it('gets a single lead', async () => {
    const response = await controllerWith().get(PRINCIPAL, 'lead-1');
    assert.equal(response.id, 'lead-1');
  });

  it('updates a lead status', async () => {
    const response = await controllerWith().update(PRINCIPAL, 'lead-1', { status: 'QUALIFIED' });
    assert.equal(response.status, 'QUALIFIED');
  });

  it('passes notes null explicitly for clearing', async () => {
    const calls: Array<{ userId: string; patch: unknown }> = [];
    const update = {
      update: async (userId: string, _id: string, patch: unknown) => {
        calls.push({ userId, patch });
        return leadSnapshot({ notes: null });
      },
    };
    const response = await controllerWith({ update }).update(PRINCIPAL, 'lead-1', { notes: null });

    assert.equal(response.notes, null);
    assert.deepEqual(calls[0]?.patch, { notes: null });
  });

  it('removes a lead and returns success', async () => {
    const response = await controllerWith().remove(PRINCIPAL, 'lead-1');
    assert.deepEqual(response, { success: true });
  });

  it('surfaces NotFound from the get use-case', async () => {
    const get = {
      get: async () => {
        throw new NotFoundException('Saved lead not found');
      },
    };
    await assert.rejects(() => controllerWith({ get }).get(PRINCIPAL, 'missing'), NotFoundException);
  });

  it('enriches a lead and returns enrichment result', async () => {
    const calls: Array<{ leadId: string; userId: string }> = [];
    const enrich = {
      enrich: async (input: { leadId: string; userId: string }) => {
        calls.push(input);
        return {
          lead: leadSnapshot({
            enrichmentStatus: 'ENRICHED',
            enrichmentSnapshot: {
              website: { title: 'Test', description: null, techHints: [], socialLinks: [] },
              enrichedAt: '2026-08-18T12:00:00.000Z',
              enrichmentVersion: 1,
            },
          }),
          durationMs: 123,
        };
      },
    };
    const response = await controllerWith({ enrich }).enrich(PRINCIPAL, 'lead-1', {});

    assert.equal(response.leadId, 'lead-1');
    assert.equal(response.durationMs, 123);
    assert.ok(response.enrichment);
    assert.equal(response.enrichment?.status, 'ENRICHED');
    assert.deepEqual(calls, [{ leadId: 'lead-1', userId: 'user-1' }]);
  });

  it('passes skip options to the enrich use-case', async () => {
    const calls: Array<{ skipWebsite?: boolean; skipSocial?: boolean }> = [];
    const enrich = {
      enrich: async (input: { skipWebsite?: boolean; skipSocial?: boolean }) => {
        calls.push({ skipWebsite: input.skipWebsite, skipSocial: input.skipSocial });
        return { lead: leadSnapshot(), durationMs: 10 };
      },
    };
    await controllerWith({ enrich }).enrich(PRINCIPAL, 'lead-1', { skipWebsite: true, skipSocial: true });
    assert.deepEqual(calls[0], { skipWebsite: true, skipSocial: true });
  });

  it('surfaces ConflictException from enrich when IN_PROGRESS', async () => {
    const enrich = {
      enrich: async () => {
        throw new ConflictException('Enrichment already in progress');
      },
    };
    await assert.rejects(() => controllerWith({ enrich }).enrich(PRINCIPAL, 'lead-1', {}), ConflictException);
  });

  it('surfaces NotFound from enrich when lead deleted after claim', async () => {
    const enrich = {
      enrich: async () => {
        throw new NotFoundException('Lead lead-1 not found');
      },
    };
    await assert.rejects(() => controllerWith({ enrich }).enrich(PRINCIPAL, 'lead-1', {}), NotFoundException);
  });
});

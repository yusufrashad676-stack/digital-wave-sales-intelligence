import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { GetSavedLeadUseCase } from '../../application/use-cases/get-saved-lead.usecase.js';
import { leadSnapshot } from '../../application/use-cases/lead-snapshot.fixture.js';
import { ListSavedLeadsUseCase } from '../../application/use-cases/list-saved-leads.usecase.js';
import { RemoveSavedLeadUseCase } from '../../application/use-cases/remove-saved-lead.usecase.js';
import { SaveLeadUseCase } from '../../application/use-cases/save-lead.usecase.js';
import { UpdateSavedLeadUseCase } from '../../application/use-cases/update-saved-lead.usecase.js';
import { LeadsController } from './leads.controller.js';

const PRINCIPAL: AuthPrincipal = { userId: 'user-1', roles: ['MEMBER'], tokenType: 'access' };

function controllerWith(overrides: Partial<Record<string, unknown>> = {}): LeadsController {
  const save = { save: async () => leadSnapshot() };
  const list = { list: async () => [leadSnapshot()] };
  const get = { get: async () => leadSnapshot() };
  const update = { update: async () => leadSnapshot({ status: 'QUALIFIED' }) };
  const remove = { remove: async () => undefined };
  return new LeadsController(
    (overrides.save ?? save) as unknown as SaveLeadUseCase,
    (overrides.list ?? list) as unknown as ListSavedLeadsUseCase,
    (overrides.get ?? get) as unknown as GetSavedLeadUseCase,
    (overrides.update ?? update) as unknown as UpdateSavedLeadUseCase,
    (overrides.remove ?? remove) as unknown as RemoveSavedLeadUseCase,
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
});

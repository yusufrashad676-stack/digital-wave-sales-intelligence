import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validate } from 'class-validator';
import { UpdateLeadDto } from './update-lead.dto.js';

describe('UpdateLeadDto', () => {
  it('accepts an empty body', async () => {
    const errors = await validate(new UpdateLeadDto());
    assert.deepEqual(errors, []);
  });

  it('accepts a status and notes', async () => {
    const dto = Object.assign(new UpdateLeadDto(), { status: 'CONTACTED', notes: 'تمت المكالمة الأولى' });
    const errors = await validate(dto);
    assert.deepEqual(errors, []);
  });

  it('accepts clearing notes with an explicit null', async () => {
    const dto = Object.assign(new UpdateLeadDto(), { notes: null });
    const errors = await validate(dto);
    assert.deepEqual(errors, []);
  });

  it('rejects an unknown status', async () => {
    const dto = Object.assign(new UpdateLeadDto(), { status: 'FROZEN' });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'status'));
  });

  it('rejects notes longer than 4000 characters', async () => {
    const dto = Object.assign(new UpdateLeadDto(), { notes: 'x'.repeat(4001) });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'notes'));
  });
});

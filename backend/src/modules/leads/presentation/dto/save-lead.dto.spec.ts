import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { SaveLeadDto } from './save-lead.dto.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const BASE = {
  providerId: 'mock',
  providerRecordId: 'mock-restaurant-003',
  companyName: 'مطعم أبو قير للمأكولات البحرية',
  retrievedAt: '2026-08-15T10:00:00.000Z',
};

function dto(overrides: Record<string, unknown> = {}): SaveLeadDto {
  return Object.assign(new SaveLeadDto(), { ...BASE, ...overrides });
}

describe('SaveLeadDto', () => {
  it('accepts a minimal valid payload', async () => {
    const errors = await validate(dto());
    assert.deepEqual(errors, []);
  });

  it('accepts the full snapshot', async () => {
    const errors = await validate(
      dto({
        category: 'restaurant',
        address: 'سيدي بشر، طريق الجيش، الإسكندرية',
        area: 'سيدي بشر',
        phone: '+20 3 540 2233',
        email: 'hello@example.com',
        website: 'https://abuqir-seafood.example.com',
        rating: 4.3,
        ratingCount: 431,
        verificationStatus: 'UNVERIFIED',
        sourceUrl: 'https://maps.example.com/place/mock-restaurant-003',
      }),
    );
    assert.deepEqual(errors, []);
  });

  it('rejects a missing providerRecordId', async () => {
    const errors = await validate(dto({ providerRecordId: undefined }));
    assert.ok(errors.some((error) => error.property === 'providerRecordId'));
  });

  it('rejects a blank companyName', async () => {
    const errors = await validate(dto({ companyName: '   ' }));
    assert.ok(errors.some((error) => error.property === 'companyName'));
  });

  it('rejects a rating above 5', async () => {
    const errors = await validate(dto({ rating: 5.5 }));
    assert.ok(errors.some((error) => error.property === 'rating'));
  });

  it('rejects a ratingCount that is not an integer', async () => {
    const errors = await validate(dto({ ratingCount: 12.5 }));
    assert.ok(errors.some((error) => error.property === 'ratingCount'));
  });

  it('rejects an invalid verificationStatus', async () => {
    const errors = await validate(dto({ verificationStatus: 'MAYBE' }));
    assert.ok(errors.some((error) => error.property === 'verificationStatus'));
  });

  it('rejects a malformed retrievedAt', async () => {
    const errors = await validate(dto({ retrievedAt: 'not-a-date' }));
    assert.ok(errors.some((error) => error.property === 'retrievedAt'));
  });

  it('rejects unknown fields through the global pipe', async () => {
    await assert.rejects(
      () => pipe.transform({ ...BASE, unexpected: true }, { metatype: SaveLeadDto, type: 'body' }),
      BadRequestException,
    );
  });
});

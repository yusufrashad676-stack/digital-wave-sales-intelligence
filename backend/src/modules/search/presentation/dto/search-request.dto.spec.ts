import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { SearchRequestDto } from './search-request.dto.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

describe('SearchRequestDto', () => {
  it('accepts a minimal valid request', async () => {
    const dto = Object.assign(new SearchRequestDto(), { query: 'عيادات في التجمع' });
    const errors = await validate(dto);
    assert.deepEqual(errors, []);
  });

  it('accepts all optional filters', async () => {
    const dto = Object.assign(new SearchRequestDto(), {
      query: 'عيادات',
      governorate: 'Cairo',
      category: 'clinic',
      minRating: 4,
      verifiedOnly: true,
    });
    const errors = await validate(dto);
    assert.deepEqual(errors, []);
  });

  it('rejects a missing query', async () => {
    const errors = await validate(new SearchRequestDto());
    assert.ok(errors.some((error) => error.property === 'query'));
  });

  it('rejects an empty query', async () => {
    const dto = Object.assign(new SearchRequestDto(), { query: '   ' });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'query'));
  });

  it('rejects a query longer than 255 characters', async () => {
    const dto = Object.assign(new SearchRequestDto(), { query: 'a'.repeat(256) });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'query'));
  });

  it('rejects a minRating above 5', async () => {
    const dto = Object.assign(new SearchRequestDto(), { query: 'عيادات', minRating: 5.5 });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'minRating'));
  });

  it('rejects a non-boolean verifiedOnly', async () => {
    const dto = Object.assign(new SearchRequestDto(), { query: 'عيادات', verifiedOnly: 'yes' });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'verifiedOnly'));
  });

  it('rejects unknown fields through the global pipe', async () => {
    await assert.rejects(
      () => pipe.transform({ query: 'عيادات', unexpected: true }, { metatype: SearchRequestDto, type: 'body' }),
      BadRequestException,
    );
  });

  it('transforms a valid body through the global pipe', async () => {
    const result = await pipe.transform(
      { query: 'عيادات', governorate: 'Cairo', minRating: 4, verifiedOnly: false },
      { metatype: SearchRequestDto, type: 'body' },
    );
    assert.ok(result instanceof SearchRequestDto);
    assert.equal(result.query, 'عيادات');
    assert.equal(result.minRating, 4);
  });
});

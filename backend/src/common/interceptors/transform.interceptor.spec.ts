import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor.js';

async function transform(payload: unknown): Promise<unknown> {
  const interceptor = new TransformInterceptor();
  const context = {} as ExecutionContext;
  const next: CallHandler = { handle: () => of(payload) };
  return lastValueFrom(interceptor.intercept(context, next));
}

describe('TransformInterceptor', () => {
  it('wraps a plain object in an envelope', async () => {
    assert.deepEqual(await transform({ id: '1', email: 'a@b.c' }), { data: { id: '1', email: 'a@b.c' } });
  });

  it('wraps an array in an envelope', async () => {
    assert.deepEqual(await transform([1, 2]), { data: [1, 2] });
  });

  it('wraps a primitive in an envelope', async () => {
    assert.deepEqual(await transform('ok'), { data: 'ok' });
  });

  it('passes an existing envelope through unchanged', async () => {
    const envelope = { data: [{ id: '1' }], meta: { total: 1 } };
    assert.deepEqual(await transform(envelope), envelope);
  });
});

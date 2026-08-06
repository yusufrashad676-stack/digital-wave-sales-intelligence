import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_PRINCIPAL_KEY, ROLES_KEY } from '../../../../common/constants/auth.constants.js';
import { RolesGuard } from './roles.guard.js';

interface ContextFixture {
  handler: () => void;
  request: Record<string, unknown>;
  context: ExecutionContext;
}

function makeContext(): ContextFixture {
  const handler = (): void => {};
  const request: Record<string, unknown> = { headers: {} };
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { handler, request, context };
}

function principal(roles: string[]): Record<string, unknown> {
  return { userId: 'user-1', roles, tokenType: 'access' };
}

describe('RolesGuard', () => {
  it('allows a route that requires no roles', async () => {
    const { context } = makeContext();

    assert.equal(new RolesGuard(new Reflector()).canActivate(context), true);
  });

  it('allows a principal that holds a required role', async () => {
    const { handler, request, context } = makeContext();
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], handler);
    request[AUTH_PRINCIPAL_KEY] = principal(['ADMIN']);

    assert.equal(new RolesGuard(new Reflector()).canActivate(context), true);
  });

  it('denies a principal missing the required role', async () => {
    const { handler, request, context } = makeContext();
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], handler);
    request[AUTH_PRINCIPAL_KEY] = principal(['GUEST']);

    assert.equal(new RolesGuard(new Reflector()).canActivate(context), false);
  });

  it('denies a request with no principal', async () => {
    const { handler, context } = makeContext();
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], handler);

    assert.equal(new RolesGuard(new Reflector()).canActivate(context), false);
  });
});

import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_PRINCIPAL_KEY, IS_PUBLIC_KEY } from '../../../../common/constants/auth.constants.js';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import type { TokenPort } from '../../domain/ports/token.port.js';
import { AuthGuard } from './auth.guard.js';

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

const tokenPort = {
  verifyAccessToken: async () => ({ sub: 'user-1', roles: ['GUEST'], type: 'access' }),
} as unknown as TokenPort;

describe('AuthGuard', () => {
  it('allows public routes without a token', async () => {
    const { handler, context } = makeContext();
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);

    const allowed = await new AuthGuard(new Reflector(), tokenPort).canActivate(context);

    assert.equal(allowed, true);
  });

  it('rejects a request with no Authorization header', async () => {
    const { context } = makeContext();

    await assert.rejects(() => new AuthGuard(new Reflector(), tokenPort).canActivate(context), UnauthorizedException);
  });

  it('rejects a malformed Authorization header', async () => {
    const { request, context } = makeContext();
    request.headers = { authorization: 'Basic abc123' };

    await assert.rejects(() => new AuthGuard(new Reflector(), tokenPort).canActivate(context), UnauthorizedException);
  });

  it('attaches the principal from a valid bearer token', async () => {
    const { request, context } = makeContext();
    request.headers = { authorization: 'Bearer valid.token' };

    const allowed = await new AuthGuard(new Reflector(), tokenPort).canActivate(context);

    assert.equal(allowed, true);
    assert.deepEqual(request[AUTH_PRINCIPAL_KEY], { userId: 'user-1', roles: ['GUEST'], tokenType: 'access' });
  });

  it('propagates verification failures', async () => {
    const { request, context } = makeContext();
    request.headers = { authorization: 'Bearer bad.token' };
    const failingTokenPort = {
      verifyAccessToken: async () => {
        throw new UnauthorizedException('Invalid or expired token');
      },
    } as unknown as TokenPort;

    await assert.rejects(
      () => new AuthGuard(new Reflector(), failingTokenPort).canActivate(context),
      UnauthorizedException,
    );
  });
});

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_PRINCIPAL_KEY } from '../constants/auth.constants.js';
import type { AuthPrincipal } from '../interfaces/auth-principal.interface.js';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthPrincipal => {
  const request = context.switchToHttp().getRequest<Request & { [AUTH_PRINCIPAL_KEY]?: AuthPrincipal }>();
  const principal = request[AUTH_PRINCIPAL_KEY];
  if (!principal) {
    throw new Error(`@CurrentUser() used on a route without an authenticated principal (${AUTH_PRINCIPAL_KEY})`);
  }
  return principal;
});

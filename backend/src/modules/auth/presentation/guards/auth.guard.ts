import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_PRINCIPAL_KEY, IS_PUBLIC_KEY } from '../../../../common/constants/auth.constants.js';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { TokenPort } from '../../domain/ports/token.port.js';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TokenPort) private readonly tokenPort: TokenPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { [AUTH_PRINCIPAL_KEY]?: AuthPrincipal }>();
    const header = request.headers.authorization;
    if (!header) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = extractBearerToken(header);
    if (!token) {
      throw new UnauthorizedException('Malformed Authorization header');
    }

    const claims = await this.tokenPort.verifyAccessToken(token);
    request[AUTH_PRINCIPAL_KEY] = { userId: claims.sub, roles: claims.roles, tokenType: 'access' };
    return true;
  }
}

function extractBearerToken(header: string): string | null {
  return header.startsWith(BEARER_PREFIX) && header.length > BEARER_PREFIX.length
    ? header.slice(BEARER_PREFIX.length).trim()
    : null;
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_PRINCIPAL_KEY, ROLES_KEY } from '../../../../common/constants/auth.constants.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles === undefined || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { [AUTH_PRINCIPAL_KEY]?: AuthPrincipal }>();
    const principal = request[AUTH_PRINCIPAL_KEY];
    if (!principal) {
      return false;
    }
    return requiredRoles.some((role) => principal.roles.includes(role));
  }
}

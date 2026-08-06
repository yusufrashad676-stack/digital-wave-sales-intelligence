import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/auth.constants.js';

export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { AuthRepository } from '../../domain/ports/auth.repository.js';
import type { UserProfile } from '../../domain/entities/refresh-token-record.entity.js';
import { buildProfile } from '../user-profile.mapper.js';

@Injectable()
export class GetMeUseCase {
  constructor(@Inject(AuthRepository) private readonly authRepository: AuthRepository) {}

  async execute(userId: string): Promise<UserProfile> {
    const user = await this.authRepository.findById(userId);
    if (user === null) {
      throw new UnauthorizedException('Account no longer exists');
    }
    const roles = await this.authRepository.findSystemRoles(userId);
    return buildProfile(user, roles);
  }
}

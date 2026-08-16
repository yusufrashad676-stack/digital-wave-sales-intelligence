import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { AuthRepository } from '../../domain/ports/auth.repository.js';
import { AuditPort } from '../../domain/ports/audit.port.js';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port.js';
import { RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(AuthRepository) private readonly authRepository: AuthRepository,
    @Inject(PasswordHasherPort) private readonly hasher: PasswordHasherPort,
    @Inject(RefreshTokenRepository) private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}

  async execute(input: ChangePasswordInput, principalUserId: string): Promise<void> {
    const user = await this.authRepository.findById(principalUserId);
    if (user === null) {
      throw new UnauthorizedException('Account no longer exists');
    }

    if (!user.isActive()) {
      throw new ForbiddenException('Account is disabled');
    }

    const currentPasswordValid = await this.hasher.verify(user.passwordHash, input.currentPassword);
    if (!currentPasswordValid) {
      this.audit.record({
        code: 'auth.password_change.failure',
        userId: principalUserId,
        metadata: { reason: 'invalid_current_password' },
      });
      throw new ForbiddenException('Current password is incorrect');
    }

    if (input.currentPassword === input.newPassword) {
      this.audit.record({
        code: 'auth.password_change.failure',
        userId: principalUserId,
        metadata: { reason: 'same_password' },
      });
      throw new ForbiddenException('New password must be different from current password');
    }

    const newHash = await this.hasher.hash(input.newPassword);
    await this.authRepository.updatePasswordHash(principalUserId, newHash);

    await this.refreshTokenRepository.revokeAllForUser(principalUserId);

    this.audit.record({ code: 'auth.password_change.success', userId: principalUserId });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { AuditPort } from '../../domain/ports/audit.port.js';
import { RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';
import { TokenPort } from '../../domain/ports/token.port.js';

export interface LogoutInput {
  refreshToken: string;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(RefreshTokenRepository) private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(TokenPort) private readonly tokenPort: TokenPort,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}

  async execute(input: LogoutInput, principalUserId: string): Promise<void> {
    const claims = await this.tokenPort.verifyRefreshToken(input.refreshToken);
    if (claims.sub !== principalUserId) {
      throw new ForbiddenException('Cannot revoke a session for another user');
    }

    const tokenHash = this.tokenPort.hashRefreshToken(input.refreshToken);
    const record = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (record !== null) {
      await this.refreshTokenRepository.revokeFamily(record.familyId, record.userId);
      this.audit.record({ code: 'auth.logout.success', userId: principalUserId });
    }
  }
}

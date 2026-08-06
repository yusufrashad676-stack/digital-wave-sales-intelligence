import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { TokenPair } from '../../domain/entities/token-pair.entity.js';
import { AuthRepository } from '../../domain/ports/auth.repository.js';
import { AuditPort } from '../../domain/ports/audit.port.js';
import { RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';
import { TokenPort } from '../../domain/ports/token.port.js';

export interface RefreshInput {
  refreshToken: string;
}

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class RefreshTokensUseCase {
  constructor(
    @Inject(AuthRepository) private readonly authRepository: AuthRepository,
    @Inject(RefreshTokenRepository) private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(TokenPort) private readonly tokenPort: TokenPort,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}

  async execute(input: RefreshInput, client: ClientContext = {}): Promise<TokenPair> {
    const claims = await this.tokenPort.verifyRefreshToken(input.refreshToken);
    const tokenHash = this.tokenPort.hashRefreshToken(input.refreshToken);
    const record = await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (record === null) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    if (record.isRevoked()) {
      await this.refreshTokenRepository.revokeFamily(record.familyId, record.userId);
      this.audit.record({
        code: 'auth.refresh.reuse',
        userId: record.userId,
        metadata: { familyId: record.familyId },
      });
      throw new UnauthorizedException('Refresh token has already been used');
    }

    const now = new Date();
    if (record.isExpired(now) || record.userId !== claims.sub || record.familyId !== claims.familyId) {
      await this.refreshTokenRepository.revoke(record.id, { updatedById: record.userId });
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = await this.authRepository.findById(record.userId);
    if (user === null || !user.isActive()) {
      throw new UnauthorizedException('Account is not active');
    }

    const roles = await this.authRepository.findSystemRoles(user.id);
    const refreshTtlSeconds = this.tokenPort.refreshTokenTtlSeconds();
    const signed = await this.tokenPort.signRefreshToken({ sub: user.id, familyId: record.familyId, type: 'refresh' });

    await this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: this.tokenPort.hashRefreshToken(signed.token),
      familyId: record.familyId,
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      createdById: user.id,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    });
    await this.refreshTokenRepository.revoke(record.id, { replacedByTokenId: signed.jti, updatedById: user.id });

    const accessToken = await this.tokenPort.signAccessToken({ sub: user.id, roles, type: 'access' });
    this.audit.record({ code: 'auth.refresh.success', userId: user.id });

    return new TokenPair(accessToken, signed.token, 'Bearer', this.tokenPort.accessTokenTtlSeconds());
  }
}

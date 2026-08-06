import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { TokenPair } from '../../domain/entities/token-pair.entity.js';
import { AuthRepository } from '../../domain/ports/auth.repository.js';
import { AuditPort } from '../../domain/ports/audit.port.js';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port.js';
import { RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';
import { TokenPort } from '../../domain/ports/token.port.js';
import { normalizeEmail } from '../user-profile.mapper.js';

export interface LoginInput {
  email: string;
  password: string;
}

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(AuthRepository) private readonly authRepository: AuthRepository,
    @Inject(PasswordHasherPort) private readonly hasher: PasswordHasherPort,
    @Inject(RefreshTokenRepository) private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(TokenPort) private readonly tokenPort: TokenPort,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}

  async execute(input: LoginInput, client: ClientContext = {}): Promise<TokenPair> {
    const email = normalizeEmail(input.email);
    const user = await this.authRepository.findByEmail(email);

    if (user === null) {
      this.audit.record({ code: 'auth.login.failure', metadata: { email } });
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.hasher.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      this.audit.record({ code: 'auth.login.failure', userId: user.id });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive()) {
      throw new ForbiddenException('Account is disabled');
    }

    const roles = await this.authRepository.findSystemRoles(user.id);
    const tokenPair = await this.issueTokenPair(user.id, roles, client);

    await this.authRepository.recordLogin(user.id, new Date());
    this.audit.record({ code: 'auth.login.success', userId: user.id });

    return tokenPair;
  }

  private async issueTokenPair(userId: string, roles: string[], client: ClientContext): Promise<TokenPair> {
    const familyId = this.tokenPort.generateFamilyId();
    const refreshTtlSeconds = this.tokenPort.refreshTokenTtlSeconds();
    const signed = await this.tokenPort.signRefreshToken({ sub: userId, familyId, type: 'refresh' });

    await this.refreshTokenRepository.create({
      userId,
      tokenHash: this.tokenPort.hashRefreshToken(signed.token),
      familyId,
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      createdById: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    });

    const accessToken = await this.tokenPort.signAccessToken({ sub: userId, roles, type: 'access' });

    return new TokenPair(accessToken, signed.token, 'Bearer', this.tokenPort.accessTokenTtlSeconds());
  }
}

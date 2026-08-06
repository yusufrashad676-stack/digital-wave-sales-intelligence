import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import type { JwtAlgorithm } from '../../../../config/configuration.js';
import type {
  AccessTokenClaims,
  RefreshTokenClaims,
  SignedRefreshToken,
  TokenPort,
} from '../../domain/ports/token.port.js';

interface TokenPayload {
  sub?: unknown;
  type?: unknown;
  roles?: unknown;
  familyId?: unknown;
  jti?: unknown;
}

@Injectable()
export class JwtTokenAdapter implements TokenPort {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwtService.signAsync({ ...claims }, this.accessOptions());
  }

  async signRefreshToken(claims: RefreshTokenClaims): Promise<SignedRefreshToken> {
    const jti = randomUUID();
    const token = await this.jwtService.signAsync({ ...claims }, { ...this.refreshOptions(), jwtid: jti });
    return { token, jti };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const payload = await this.verify(token, 'auth.jwt.accessSecret');
    if (payload.type !== 'access' || typeof payload.sub !== 'string' || !Array.isArray(payload.roles)) {
      throw new UnauthorizedException('Invalid access token');
    }
    return {
      sub: payload.sub,
      roles: payload.roles.filter((role): role is string => typeof role === 'string'),
      type: 'access',
    };
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenClaims> {
    const payload = await this.verify(token, 'auth.jwt.refreshSecret');
    if (payload.type !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.familyId !== 'string') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return { sub: payload.sub, familyId: payload.familyId, type: 'refresh' };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  generateFamilyId(): string {
    return randomUUID();
  }

  accessTokenTtlSeconds(): number {
    return this.config.getOrThrow<number>('auth.jwt.accessTtlSeconds');
  }

  refreshTokenTtlSeconds(): number {
    return this.config.getOrThrow<number>('auth.jwt.refreshTtlSeconds');
  }

  private async verify(token: string, secretPath: string): Promise<TokenPayload> {
    try {
      return await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.config.getOrThrow<string>(secretPath),
        algorithms: [this.algorithm()],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private algorithm(): JwtAlgorithm {
    return this.config.getOrThrow<JwtAlgorithm>('auth.jwt.algorithm');
  }

  private accessOptions(): Record<string, unknown> {
    return {
      secret: this.config.getOrThrow<string>('auth.jwt.accessSecret'),
      algorithm: this.algorithm(),
      expiresIn: this.config.getOrThrow<number>('auth.jwt.accessTtlSeconds'),
    };
  }

  private refreshOptions(): Record<string, unknown> {
    return {
      secret: this.config.getOrThrow<string>('auth.jwt.refreshSecret'),
      algorithm: this.algorithm(),
      expiresIn: this.config.getOrThrow<number>('auth.jwt.refreshTtlSeconds'),
    };
  }
}

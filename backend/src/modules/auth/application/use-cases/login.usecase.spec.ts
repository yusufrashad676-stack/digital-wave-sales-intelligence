import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '../../../../common/exceptions/error-codes.js';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { TokenPair } from '../../domain/entities/token-pair.entity.js';
import { UserAccount } from '../../domain/entities/user-account.entity.js';
import type { AuthRepository } from '../../domain/ports/auth.repository.js';
import type { AuditPort } from '../../domain/ports/audit.port.js';
import type { PasswordHasherPort } from '../../domain/ports/password-hasher.port.js';
import type { RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';
import type { TokenPort } from '../../domain/ports/token.port.js';
import { LoginUseCase } from './login.usecase.js';

function account(overrides: Partial<UserAccount> = {}): UserAccount {
  return new UserAccount(
    overrides.id ?? 'user-1',
    overrides.email ?? 'Alice@Example.com',
    overrides.displayName ?? 'Alice',
    overrides.passwordHash ?? 'hash',
    overrides.status ?? 'ACTIVE',
    overrides.lastLoginAt ?? null,
    overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    overrides.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
  );
}

interface Mocks {
  authRepository: AuthRepository;
  hasher: PasswordHasherPort;
  refreshTokenRepository: RefreshTokenRepository;
  tokenPort: TokenPort;
  audits: string[];
  useCase: LoginUseCase;
}

function makeUseCase(): Mocks {
  const audits: string[] = [];
  const authRepository = {
    findByEmail: async () => null,
    findById: async () => null,
    createUserWithRole: async () => account(),
    findSystemRoles: async () => ['GUEST'],
    recordLogin: async () => {},
  } as unknown as AuthRepository;

  const hasher = {
    hash: async () => 'hash',
    verify: async () => true,
  } as unknown as PasswordHasherPort;

  const refreshTokenRepository = {
    create: async () => ({}),
    findByTokenHash: async () => null,
    revoke: async () => {},
    revokeFamily: async () => {},
  } as unknown as RefreshTokenRepository;

  const tokenPort = {
    signAccessToken: async () => 'access.token',
    signRefreshToken: async () => ({ token: 'refresh.token', jti: 'jti-1' }),
    verifyAccessToken: async () => ({ sub: 'user-1', roles: [], type: 'access' }),
    verifyRefreshToken: async () => ({ sub: 'user-1', familyId: 'family-1', type: 'refresh' }),
    hashRefreshToken: () => 'hashed-token',
    generateFamilyId: () => 'family-1',
    accessTokenTtlSeconds: () => 900,
    refreshTokenTtlSeconds: () => 2592000,
  } as unknown as TokenPort;

  const audit: AuditPort = { record: (event) => audits.push(event.code) };
  const useCase = new LoginUseCase(authRepository, hasher, refreshTokenRepository, tokenPort, audit);
  return { authRepository, hasher, refreshTokenRepository, tokenPort, audits, useCase };
}

describe('LoginUseCase', () => {
  it('returns a token pair and records the session on success', async () => {
    const { authRepository, audits, useCase } = makeUseCase();
    (authRepository.findByEmail as () => Promise<UserAccount | null>) = async () => account();

    const pair = await useCase.execute({ email: ' alice@example.com ', password: 'secret' }, { ipAddress: '1.2.3.4' });

    assert.ok(pair instanceof TokenPair);
    assert.equal(pair.accessToken, 'access.token');
    assert.equal(pair.refreshToken, 'refresh.token');
    assert.equal(pair.tokenType, 'Bearer');
    assert.equal(pair.expiresIn, 900);
    assert.deepEqual(audits, ['auth.login.success']);
  });

  it('normalizes the email before lookup', async () => {
    const { authRepository, useCase } = makeUseCase();
    let lookedUp: string | undefined;
    (authRepository.findByEmail as unknown) = async (email: string) => {
      lookedUp = email;
      return account({ email });
    };

    await useCase.execute({ email: '  ALICE@example.com ', password: 'secret' });

    assert.equal(lookedUp, 'alice@example.com');
  });

  it('rejects an unknown email without revealing the account exists', async () => {
    const { audits, useCase } = makeUseCase();

    await assert.rejects(
      () => useCase.execute({ email: 'ghost@example.com', password: 'secret' }),
      UnauthorizedException,
    );
    assert.deepEqual(audits, ['auth.login.failure']);
  });

  it('rejects a wrong password', async () => {
    const { authRepository, hasher, audits, useCase } = makeUseCase();
    (authRepository.findByEmail as () => Promise<UserAccount | null>) = async () => account();
    (hasher.verify as () => Promise<boolean>) = async () => false;

    await assert.rejects(
      () => useCase.execute({ email: 'alice@example.com', password: 'wrong' }),
      UnauthorizedException,
    );
    assert.deepEqual(audits, ['auth.login.failure']);
  });

  it('rejects a disabled account with FORBIDDEN', async () => {
    const { authRepository, useCase } = makeUseCase();
    (authRepository.findByEmail as () => Promise<UserAccount | null>) = async () => account({ status: 'DISABLED' });

    await assert.rejects(
      () => useCase.execute({ email: 'alice@example.com', password: 'secret' }),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal((err as ForbiddenException).code, ErrorCode.FORBIDDEN);
        return true;
      },
    );
  });

  it('creates a refresh token record with a hashed token and family id', async () => {
    const { authRepository, refreshTokenRepository, useCase } = makeUseCase();
    (authRepository.findByEmail as () => Promise<UserAccount | null>) = async () => account();
    let created: unknown;
    (refreshTokenRepository.create as unknown) = async (input: unknown) => {
      created = input;
      return {};
    };

    await useCase.execute({ email: 'alice@example.com', password: 'secret' }, { userAgent: 'curl' });

    assert.deepEqual(created, {
      userId: 'user-1',
      tokenHash: 'hashed-token',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 2592000 * 1000),
      createdById: 'user-1',
      ipAddress: undefined,
      userAgent: 'curl',
    });
  });

  it('records last login after issuing tokens', async () => {
    const { authRepository, useCase } = makeUseCase();
    (authRepository.findByEmail as () => Promise<UserAccount | null>) = async () => account();
    let recorded = false;
    (authRepository.recordLogin as unknown) = async () => {
      recorded = true;
    };

    await useCase.execute({ email: 'alice@example.com', password: 'secret' });

    assert.equal(recorded, true);
  });
});

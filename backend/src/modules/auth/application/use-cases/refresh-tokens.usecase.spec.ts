import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { RefreshTokenRecord } from '../../domain/entities/refresh-token-record.entity.js';
import { UserAccount } from '../../domain/entities/user-account.entity.js';
import type { AuthRepository } from '../../domain/ports/auth.repository.js';
import type { AuditPort } from '../../domain/ports/audit.port.js';
import type { RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';
import type { TokenPort } from '../../domain/ports/token.port.js';
import { RefreshTokensUseCase } from './refresh-tokens.usecase.js';

function record(overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  return new RefreshTokenRecord(
    overrides.id ?? 'rt-1',
    overrides.userId ?? 'user-1',
    overrides.tokenHash ?? 'hashed-token',
    overrides.familyId ?? 'family-1',
    overrides.expiresAt ?? new Date('2099-01-01T00:00:00Z'),
    overrides.revokedAt ?? null,
    overrides.replacedByTokenId ?? null,
    overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
  );
}

function account(overrides: Partial<UserAccount> = {}): UserAccount {
  return new UserAccount(
    overrides.id ?? 'user-1',
    overrides.email ?? 'alice@example.com',
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
  refreshTokenRepository: RefreshTokenRepository;
  tokenPort: TokenPort;
  audits: string[];
  useCase: RefreshTokensUseCase;
}

function makeUseCase(): Mocks {
  const audits: string[] = [];
  const authRepository = {
    findByEmail: async () => null,
    findById: async () => account(),
    createUserWithRole: async () => account(),
    findSystemRoles: async () => ['GUEST'],
    recordLogin: async () => {},
  } as unknown as AuthRepository;

  const refreshTokenRepository = {
    create: async () => record(),
    findByTokenHash: async () => record(),
    revoke: async () => {},
    revokeFamily: async () => {},
  } as unknown as RefreshTokenRepository;

  const tokenPort = {
    signAccessToken: async () => 'access.token',
    signRefreshToken: async () => ({ token: 'refresh.token', jti: 'jti-2' }),
    verifyAccessToken: async () => ({ sub: 'user-1', roles: [], type: 'access' }),
    verifyRefreshToken: async () => ({ sub: 'user-1', familyId: 'family-1', type: 'refresh' }),
    hashRefreshToken: () => 'hashed-token',
    generateFamilyId: () => 'family-1',
    accessTokenTtlSeconds: () => 900,
    refreshTokenTtlSeconds: () => 2592000,
  } as unknown as TokenPort;

  const audit: AuditPort = { record: (event) => audits.push(event.code) };
  const useCase = new RefreshTokensUseCase(authRepository, refreshTokenRepository, tokenPort, audit);
  return { authRepository, refreshTokenRepository, tokenPort, audits, useCase };
}

describe('RefreshTokensUseCase', () => {
  it('rotates the token: creates a new record and revokes the old one with the replacement jti', async () => {
    const { refreshTokenRepository, audits, useCase } = makeUseCase();
    let created: unknown;
    let revoked: unknown;
    (refreshTokenRepository.create as unknown) = async (input: unknown) => {
      created = input;
      return record();
    };
    (refreshTokenRepository.revoke as unknown) = async (id: string, options: unknown) => {
      revoked = { id, options };
    };

    const pair = await useCase.execute({ refreshToken: 'refresh.token' });

    assert.equal(pair.accessToken, 'access.token');
    assert.equal(pair.refreshToken, 'refresh.token');
    assert.equal((created as { familyId: string }).familyId, 'family-1');
    assert.equal((created as { tokenHash: string }).tokenHash, 'hashed-token');
    assert.deepEqual(revoked, { id: 'rt-1', options: { replacedByTokenId: 'jti-2', updatedById: 'user-1' } });
    assert.deepEqual(audits, ['auth.refresh.success']);
  });

  it('revokes the whole family when a revoked token is reused', async () => {
    const { refreshTokenRepository, audits, useCase } = makeUseCase();
    (refreshTokenRepository.findByTokenHash as () => Promise<RefreshTokenRecord | null>) = async () =>
      record({ revokedAt: new Date('2026-01-02T00:00:00Z') });
    let revokedFamily = false;
    (refreshTokenRepository.revokeFamily as unknown) = async () => {
      revokedFamily = true;
    };

    await assert.rejects(() => useCase.execute({ refreshToken: 'refresh.token' }), UnauthorizedException);
    assert.equal(revokedFamily, true);
    assert.deepEqual(audits, ['auth.refresh.reuse']);
  });

  it('revokes the presented token when it has expired', async () => {
    const { refreshTokenRepository, useCase } = makeUseCase();
    (refreshTokenRepository.findByTokenHash as () => Promise<RefreshTokenRecord | null>) = async () =>
      record({ expiresAt: new Date('2020-01-01T00:00:00Z') });
    let revoked = false;
    (refreshTokenRepository.revoke as unknown) = async () => {
      revoked = true;
    };

    await assert.rejects(() => useCase.execute({ refreshToken: 'refresh.token' }), UnauthorizedException);
    assert.equal(revoked, true);
  });

  it('rejects a record whose claims do not match', async () => {
    const { refreshTokenRepository, tokenPort, useCase } = makeUseCase();
    (refreshTokenRepository.findByTokenHash as () => Promise<RefreshTokenRecord | null>) = async () =>
      record({ userId: 'user-1' });
    (tokenPort.verifyRefreshToken as unknown) = async () => ({
      sub: 'user-1',
      familyId: 'other-family',
      type: 'refresh',
    });

    await assert.rejects(() => useCase.execute({ refreshToken: 'refresh.token' }), UnauthorizedException);
  });

  it('rejects a disabled account', async () => {
    const { authRepository, useCase } = makeUseCase();
    (authRepository.findById as () => Promise<UserAccount | null>) = async () => account({ status: 'DISABLED' });

    await assert.rejects(() => useCase.execute({ refreshToken: 'refresh.token' }), UnauthorizedException);
  });

  it('rejects an unknown token hash', async () => {
    const { refreshTokenRepository, useCase } = makeUseCase();
    (refreshTokenRepository.findByTokenHash as () => Promise<RefreshTokenRecord | null>) = async () => null;

    await assert.rejects(() => useCase.execute({ refreshToken: 'refresh.token' }), UnauthorizedException);
  });
});

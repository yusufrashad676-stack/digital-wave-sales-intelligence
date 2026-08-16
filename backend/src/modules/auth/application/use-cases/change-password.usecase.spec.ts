import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '../../../../common/exceptions/error-codes.js';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { UserAccount } from '../../domain/entities/user-account.entity.js';
import type { AuthRepository } from '../../domain/ports/auth.repository.js';
import type { AuditPort } from '../../domain/ports/audit.port.js';
import type { PasswordHasherPort } from '../../domain/ports/password-hasher.port.js';
import type { RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';
import { ChangePasswordUseCase } from './change-password.usecase.js';

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
  hasher: PasswordHasherPort;
  refreshTokenRepository: RefreshTokenRepository;
  audits: Array<{ code: string; userId?: string; metadata?: Record<string, unknown> }>;
  useCase: ChangePasswordUseCase;
}

function makeUseCase(): Mocks {
  const audits: Array<{ code: string; userId?: string; metadata?: Record<string, unknown> }> = [];
  const authRepository = {
    findByEmail: async () => account(),
    findById: async () => account(),
    createUserWithRole: async () => account(),
    findSystemRoles: async () => ['GUEST'],
    recordLogin: async () => {},
    updatePasswordHash: async () => {},
  } as unknown as AuthRepository;

  const hasher = {
    hash: async () => 'new-hash',
    verify: async () => true,
  } as unknown as PasswordHasherPort;

  const refreshTokenRepository = {
    create: async () => ({}),
    findByTokenHash: async () => null,
    revoke: async () => {},
    revokeFamily: async () => {},
    revokeAllForUser: async () => {},
  } as unknown as RefreshTokenRepository;

  const audit: AuditPort = {
    record: (event) => audits.push({ code: event.code, userId: event.userId, metadata: event.metadata }),
  };
  const useCase = new ChangePasswordUseCase(authRepository, hasher, refreshTokenRepository, audit);
  return { authRepository, hasher, refreshTokenRepository, audits, useCase };
}

describe('ChangePasswordUseCase', () => {
  it('updates the password hash and revokes all refresh tokens on success', async () => {
    const { authRepository, refreshTokenRepository, audits, useCase } = makeUseCase();
    let updatedHash: unknown;
    let revokedUserId: unknown;
    (authRepository.updatePasswordHash as unknown) = async (userId: string, hash: string) => {
      updatedHash = { userId, hash };
    };
    (refreshTokenRepository.revokeAllForUser as unknown) = async (userId: string) => {
      revokedUserId = userId;
    };

    await useCase.execute({ currentPassword: 'Old123!@#', newPassword: 'New456$%^' }, 'user-1');

    assert.deepEqual(updatedHash, { userId: 'user-1', hash: 'new-hash' });
    assert.equal(revokedUserId, 'user-1');
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.code, 'auth.password_change.success');
    assert.equal(audits[0]?.userId, 'user-1');
  });

  it('rejects when the account no longer exists', async () => {
    const { authRepository, useCase } = makeUseCase();
    (authRepository.findById as () => Promise<UserAccount | null>) = async () => null;

    await assert.rejects(
      () => useCase.execute({ currentPassword: 'Old123!@#', newPassword: 'New456$%^' }, 'user-1'),
      UnauthorizedException,
    );
  });

  it('rejects when the account is disabled', async () => {
    const { authRepository, useCase } = makeUseCase();
    (authRepository.findById as () => Promise<UserAccount | null>) = async () => account({ status: 'DISABLED' });

    await assert.rejects(
      () => useCase.execute({ currentPassword: 'Old123!@#', newPassword: 'New456$%^' }, 'user-1'),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal((err as ForbiddenException).code, ErrorCode.FORBIDDEN);
        return true;
      },
    );
  });

  it('rejects an incorrect current password', async () => {
    const { hasher, audits, useCase } = makeUseCase();
    (hasher.verify as () => Promise<boolean>) = async () => false;

    await assert.rejects(
      () => useCase.execute({ currentPassword: 'wrong', newPassword: 'New456$%^' }, 'user-1'),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal((err as ForbiddenException).code, ErrorCode.FORBIDDEN);
        return true;
      },
    );
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.code, 'auth.password_change.failure');
    assert.deepEqual(audits[0]?.metadata, { reason: 'invalid_current_password' });
  });

  it('rejects when new password matches current password', async () => {
    const { audits, useCase } = makeUseCase();

    await assert.rejects(
      () => useCase.execute({ currentPassword: 'Same123!@#', newPassword: 'Same123!@#' }, 'user-1'),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal((err as ForbiddenException).code, ErrorCode.FORBIDDEN);
        return true;
      },
    );
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.code, 'auth.password_change.failure');
    assert.deepEqual(audits[0]?.metadata, { reason: 'same_password' });
  });

  it('does not update or revoke when current password is wrong', async () => {
    const { hasher, authRepository, refreshTokenRepository, useCase } = makeUseCase();
    (hasher.verify as () => Promise<boolean>) = async () => false;
    let updated = false;
    let revoked = false;
    (authRepository.updatePasswordHash as unknown) = async () => {
      updated = true;
    };
    (refreshTokenRepository.revokeAllForUser as unknown) = async () => {
      revoked = true;
    };

    await assert.rejects(
      () => useCase.execute({ currentPassword: 'wrong', newPassword: 'New456$%^' }, 'user-1'),
      ForbiddenException,
    );

    assert.equal(updated, false);
    assert.equal(revoked, false);
  });
});

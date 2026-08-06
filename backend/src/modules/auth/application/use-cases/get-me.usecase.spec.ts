import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UnauthorizedException } from '../../../../common/exceptions/unauthorized.exception.js';
import { UserAccount } from '../../domain/entities/user-account.entity.js';
import type { AuthRepository } from '../../domain/ports/auth.repository.js';
import { GetMeUseCase } from './get-me.usecase.js';

function account(): UserAccount {
  return new UserAccount(
    'user-1',
    'alice@example.com',
    'Alice',
    'hash',
    'ACTIVE',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-01T00:00:00Z'),
  );
}

describe('GetMeUseCase', () => {
  it('returns the profile with system roles', async () => {
    const authRepository = {
      findByEmail: async () => null,
      findById: async () => account(),
      createUserWithRole: async () => account(),
      findSystemRoles: async () => ['ADMIN', 'GUEST'],
      recordLogin: async () => {},
    } as unknown as AuthRepository;

    const profile = await new GetMeUseCase(authRepository).execute('user-1');

    assert.equal(profile.id, 'user-1');
    assert.equal(profile.email, 'alice@example.com');
    assert.deepEqual(profile.roles, ['ADMIN', 'GUEST']);
    assert.ok(profile.lastLoginAt instanceof Date);
  });

  it('rejects when the account no longer exists', async () => {
    const authRepository = {
      findByEmail: async () => null,
      findById: async () => null,
      createUserWithRole: async () => account(),
      findSystemRoles: async () => [],
      recordLogin: async () => {},
    } as unknown as AuthRepository;

    await assert.rejects(() => new GetMeUseCase(authRepository).execute('user-1'), UnauthorizedException);
  });
});

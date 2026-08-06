import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '../../../../common/exceptions/conflict.exception.js';
import { ErrorCode } from '../../../../common/exceptions/error-codes.js';
import { SystemRole } from '../../domain/value-objects/system-role.enum.js';
import { UserAccount } from '../../domain/entities/user-account.entity.js';
import type { AuthRepository } from '../../domain/ports/auth.repository.js';
import type { AuditPort } from '../../domain/ports/audit.port.js';
import type { PasswordHasherPort } from '../../domain/ports/password-hasher.port.js';
import { RegisterUserUseCase } from './register-user.usecase.js';

function account(): UserAccount {
  return new UserAccount(
    'user-1',
    'alice@example.com',
    'Alice',
    'hash',
    'ACTIVE',
    null,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-01T00:00:00Z'),
  );
}

interface Mocks {
  authRepository: AuthRepository;
  hasher: PasswordHasherPort;
  audits: string[];
  useCase: RegisterUserUseCase;
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

  const audit: AuditPort = { record: (event) => audits.push(event.code) };
  return { authRepository, hasher, audits, useCase: new RegisterUserUseCase(authRepository, hasher, audit) };
}

describe('RegisterUserUseCase', () => {
  it('registers a user with the GUEST role by default', async () => {
    const { authRepository, audits, useCase } = makeUseCase();
    let created: unknown;
    (authRepository.createUserWithRole as unknown) = async (input: unknown) => {
      created = input;
      return account();
    };

    const profile = await useCase.execute({
      email: 'ALICE@example.com',
      password: 'super-secret',
      displayName: 'Alice',
    });

    assert.equal(profile.email, 'alice@example.com');
    assert.deepEqual(profile.roles, ['GUEST']);
    assert.equal(profile.status, 'ACTIVE');
    assert.deepEqual(audits, ['auth.register.success']);
    assert.equal((created as { defaultRoleCode: string }).defaultRoleCode, SystemRole.GUEST);
    assert.equal((created as { passwordHash: string }).passwordHash, 'hash');
  });

  it('normalizes the email and hashes the password', async () => {
    const { authRepository, useCase } = makeUseCase();
    let created: unknown;
    (authRepository.createUserWithRole as unknown) = async (input: unknown) => {
      created = input;
      return account();
    };

    await useCase.execute({ email: '  ALICE@Example.com ', password: 'super-secret', displayName: 'Alice' });

    assert.equal((created as { email: string }).email, 'alice@example.com');
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    const { authRepository, audits, useCase } = makeUseCase();
    (authRepository.findByEmail as () => Promise<UserAccount | null>) = async () => account();

    await assert.rejects(
      () => useCase.execute({ email: 'alice@example.com', password: 'super-secret', displayName: 'Alice' }),
      (err: unknown) => {
        assert.ok(err instanceof ConflictException);
        assert.equal((err as ConflictException).code, ErrorCode.CONFLICT);
        assert.deepEqual((err as ConflictException).details, { field: 'email' });
        return true;
      },
    );
    assert.deepEqual(audits, []);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '../../../../common/exceptions/forbidden.exception.js';
import { RefreshTokenRecord } from '../../domain/entities/refresh-token-record.entity.js';
import type { AuditPort } from '../../domain/ports/audit.port.js';
import type { RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';
import type { TokenPort } from '../../domain/ports/token.port.js';
import { LogoutUseCase } from './logout.usecase.js';

function record(): RefreshTokenRecord {
  return new RefreshTokenRecord(
    'rt-1',
    'user-1',
    'hashed-token',
    'family-1',
    new Date('2099-01-01T00:00:00Z'),
    null,
    null,
    new Date('2026-01-01T00:00:00Z'),
  );
}

interface Mocks {
  refreshTokenRepository: RefreshTokenRepository;
  tokenPort: TokenPort;
  audits: string[];
  useCase: LogoutUseCase;
}

function makeUseCase(): Mocks {
  const audits: string[] = [];
  const refreshTokenRepository = {
    create: async () => record(),
    findByTokenHash: async () => record(),
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
  const useCase = new LogoutUseCase(refreshTokenRepository, tokenPort, audit);
  return { refreshTokenRepository, tokenPort, audits, useCase };
}

describe('LogoutUseCase', () => {
  it('revokes the session family when the token belongs to the principal', async () => {
    const { refreshTokenRepository, audits, useCase } = makeUseCase();
    let revokedFamily: unknown;
    (refreshTokenRepository.revokeFamily as unknown) = async (familyId: string, userId: string) => {
      revokedFamily = { familyId, userId };
    };

    await useCase.execute({ refreshToken: 'refresh.token' }, 'user-1');

    assert.deepEqual(revokedFamily, { familyId: 'family-1', userId: 'user-1' });
    assert.deepEqual(audits, ['auth.logout.success']);
  });

  it('does not revoke anything when no record exists', async () => {
    const { refreshTokenRepository, audits, useCase } = makeUseCase();
    (refreshTokenRepository.findByTokenHash as () => Promise<RefreshTokenRecord | null>) = async () => null;
    let revokedFamily = false;
    (refreshTokenRepository.revokeFamily as unknown) = async () => {
      revokedFamily = true;
    };

    await useCase.execute({ refreshToken: 'refresh.token' }, 'user-1');

    assert.equal(revokedFamily, false);
    assert.deepEqual(audits, []);
  });

  it('forbids revoking a session owned by another user', async () => {
    const { tokenPort, refreshTokenRepository, useCase } = makeUseCase();
    (tokenPort.verifyRefreshToken as unknown) = async () => ({ sub: 'user-2', familyId: 'family-1', type: 'refresh' });
    let revokedFamily = false;
    (refreshTokenRepository.revokeFamily as unknown) = async () => {
      revokedFamily = true;
    };

    await assert.rejects(() => useCase.execute({ refreshToken: 'refresh.token' }, 'user-1'), ForbiddenException);
    assert.equal(revokedFamily, false);
  });
});

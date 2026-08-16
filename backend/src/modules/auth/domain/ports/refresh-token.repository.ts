import type { RefreshTokenRecord } from '../entities/refresh-token-record.entity.js';

export const RefreshTokenRepository = Symbol('RefreshTokenRepository');

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  createdById: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string, options?: { replacedByTokenId?: string; updatedById?: string }): Promise<void>;
  revokeFamily(familyId: string, userId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

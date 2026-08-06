import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import { RefreshTokenRecord } from '../../domain/entities/refresh-token-record.entity.js';
import type { CreateRefreshTokenInput, RefreshTokenRepository } from '../../domain/ports/refresh-token.repository.js';

export interface RevokeOptions {
  replacedByTokenId?: string;
  updatedById?: string;
}

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const row = await this.prisma.client.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        createdById: input.createdById,
        updatedById: input.createdById,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    return toRecord(row);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await this.prisma.client.refreshToken.findUnique({ where: { tokenHash } });
    return row === null ? null : toRecord(row);
  }

  async revoke(id: string, options: RevokeOptions = {}): Promise<void> {
    await this.prisma.client.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        replacedByTokenId: options.replacedByTokenId ?? null,
        updatedById: options.updatedById ?? null,
      },
    });
  }

  async revokeFamily(familyId: string, userId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, userId, revokedAt: null },
      data: { revokedAt: new Date(), updatedById: userId },
    });
  }
}

function toRecord(row: {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  createdAt: Date;
}): RefreshTokenRecord {
  return new RefreshTokenRecord(
    row.id,
    row.userId,
    row.tokenHash,
    row.familyId,
    row.expiresAt,
    row.revokedAt,
    row.replacedByTokenId,
    row.createdAt,
  );
}

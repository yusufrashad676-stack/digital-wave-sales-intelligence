import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import { ServiceUnavailableException } from '../../../../common/exceptions/service-unavailable.exception.js';
import { UserAccount } from '../../domain/entities/user-account.entity.js';
import type { AuthRepository, CreateUserInput } from '../../domain/ports/auth.repository.js';

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserAccount | null> {
    const row = await this.prisma.client.user.findFirst({ where: { email, deletedAt: null } });
    return row === null ? null : toUserAccount(row);
  }

  async findById(id: string): Promise<UserAccount | null> {
    const row = await this.prisma.client.user.findFirst({ where: { id, deletedAt: null } });
    return row === null ? null : toUserAccount(row);
  }

  async createUserWithRole(input: CreateUserInput): Promise<UserAccount> {
    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          status: 'ACTIVE',
        },
      });

      const role = await tx.role.findFirst({
        where: { code: input.defaultRoleCode, kind: 'SYSTEM', status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });
      if (role === null) {
        throw new ServiceUnavailableException(`System role ${input.defaultRoleCode} is not provisioned`);
      }

      await tx.roleAssignment.create({
        data: { userId: user.id, roleId: role.id, assignedById: user.id, assignedAt: new Date(), createdById: user.id },
      });

      return toUserAccount(user);
    });
  }

  async findSystemRoles(userId: string): Promise<string[]> {
    const rows = await this.prisma.client.roleAssignment.findMany({
      where: { userId, deletedAt: null, role: { kind: 'SYSTEM', deletedAt: null } },
      select: { role: { select: { code: true } } },
    });
    return rows.map((row) => row.role.code);
  }

  async recordLogin(userId: string, at: Date): Promise<void> {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { lastLoginAt: at, updatedById: userId },
    });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash, updatedById: userId },
    });
  }
}

function toUserAccount(row: {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UserAccount {
  return new UserAccount(
    row.id,
    row.email,
    row.displayName,
    row.passwordHash,
    row.status as UserAccount['status'],
    row.lastLoginAt,
    row.createdAt,
    row.updatedAt,
  );
}

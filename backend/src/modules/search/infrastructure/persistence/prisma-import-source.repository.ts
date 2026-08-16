import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type { ImportSourceRepository, ImportSourceSnapshot } from '../../domain/ports/import-source.repository.js';

@Injectable()
export class PrismaImportSourceRepository implements ImportSourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<ImportSourceSnapshot | null> {
    const row = await this.prisma.client.importSource.findFirst({
      where: { code, enabled: true, deletedAt: null },
    });
    return row === null ? null : toSnapshot(row);
  }
}

function toSnapshot(row: {
  id: string;
  code: string;
  name: string;
  category: string;
  enabled: boolean;
  capabilities: unknown;
}): ImportSourceSnapshot {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    enabled: row.enabled,
    capabilities: toCapabilities(row.capabilities),
  };
}

function toCapabilities(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

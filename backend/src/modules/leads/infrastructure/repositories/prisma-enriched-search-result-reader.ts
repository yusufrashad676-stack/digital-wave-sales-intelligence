import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type { EnrichedSearchResultRecord } from '../../domain/ports/enriched-search-result-reader.js';
import { EnrichedSearchResultReader } from '../../domain/ports/enriched-search-result-reader.js';

@Injectable()
export class PrismaEnrichedSearchResultReader implements EnrichedSearchResultReader {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdForUser(searchResultId: string, userId: string): Promise<EnrichedSearchResultRecord | null> {
    const row = await this.prisma.client.searchResult.findFirst({
      where: {
        id: searchResultId,
        deletedAt: null,
        execution: {
          job: { userId, deletedAt: null },
        },
      },
      select: {
        id: true,
        providerRecordId: true,
        enrichmentStatus: true,
        enrichmentSnapshot: true,
        enrichedAt: true,
      },
    });

    if (row === null) return null;

    return {
      id: row.id,
      providerRecordId: row.providerRecordId,
      enrichmentStatus: row.enrichmentStatus,
      enrichmentSnapshot: (row.enrichmentSnapshot ?? null) as EnrichedSearchResultRecord['enrichmentSnapshot'],
      enrichedAt: row.enrichedAt,
    };
  }
}

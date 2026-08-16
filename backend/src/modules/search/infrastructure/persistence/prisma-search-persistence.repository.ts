import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type {
  PersistResultBatchInput,
  SearchPersistenceRepository,
} from '../../domain/ports/search-persistence.repository.js';

@Injectable()
export class PrismaSearchPersistenceRepository implements SearchPersistenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async persistResultBatch(input: PersistResultBatchInput): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const rawImport = await tx.rawImport.create({
        data: {
          executionId: input.executionId,
          importSourceId: input.importSourceId,
          format: input.rawFormat,
          payload: input.rawEvidence as unknown as Prisma.InputJsonValue,
          payloadSize: payloadByteLength(input.rawEvidence),
          recordCount: input.results.length,
          correlationId: input.correlationId,
          receivedAt: input.receivedAt,
        },
        select: { id: true },
      });

      if (input.results.length > 0) {
        await tx.searchResult.createMany({
          data: input.results.map((result, index) => ({
            executionId: input.executionId,
            rawImportId: rawImport.id,
            providerId: result.providerId,
            providerRecordId: result.providerRecordId,
            companyName: result.companyName,
            category: result.category,
            formattedAddress: result.address,
            area: result.area,
            latitude: null,
            longitude: null,
            phone: result.phone,
            email: null,
            websiteDomain: websiteDomainOf(result.website),
            rating: result.rating,
            ratingCount: result.ratingCount,
            sourceUrl: result.sourceUrl,
            ordering: index,
            verificationStatus: result.verificationStatus,
            companyId: null,
            retrievedAt: result.retrievedAt,
          })),
        });
      }
    });
  }
}

function payloadByteLength(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    return 0;
  }
}

function websiteDomainOf(website: string | null): string | null {
  if (website === null) {
    return null;
  }
  try {
    const url = new URL(website);
    return url.hostname.length > 0 ? url.hostname : null;
  } catch {
    return null;
  }
}

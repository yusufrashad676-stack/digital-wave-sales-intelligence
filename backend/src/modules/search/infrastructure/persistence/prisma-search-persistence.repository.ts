import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type {
  PersistResultBatchInput,
  SearchPersistenceRepository,
} from '../../domain/ports/search-persistence.repository.js';

const COMPANY_NAME_MAX_LENGTH = 255;

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

      for (const [index, result] of input.results.entries()) {
        const company = await resolveOrCreateCompany(tx, {
          importSourceId: input.importSourceId,
          providerRecordId: result.providerRecordId,
          name: result.companyName,
        });

        await tx.searchResult.create({
          data: {
            executionId: input.executionId,
            rawImportId: rawImport.id,
            providerId: result.providerId,
            providerRecordId: result.providerRecordId,
            companyName: result.companyName,
            category: result.category,
            formattedAddress: result.address,
            area: result.area,
            latitude: result.latitude,
            longitude: result.longitude,
            phone: result.phone,
            email: null,
            websiteDomain: websiteDomainOf(result.website),
            rating: result.rating,
            ratingCount: result.ratingCount,
            sourceUrl: result.sourceUrl,
            ordering: index,
            verificationStatus: result.verificationStatus,
            companyId: company.id,
            retrievedAt: result.retrievedAt,
          },
        });
      }
    });
  }
}

/**
 * Resolve the canonical Company for a provider identity, creating it if needed.
 *
 * Identity is exactly `(importSourceId, providerRecordId)` — never name, phone,
 * website, email, or `importSourceRef`. At most ONE active Company may exist per
 * identity; the database is the final authority via the partial unique index
 * `uq_companies_provider_identity_active` (UNIQUE (import_source_id,
 * provider_record_id) WHERE deleted_at IS NULL; see migration
 * 20260819000000_add_company_provider_identity and docs/DATABASE_RULES.md registry #11).
 *
 * Prisma's `upsert`/`findUnique` cannot target a *partial* unique index (it is not
 * exposed as a unique selector), so this uses a minimal parameterized native-SQL
 * `INSERT ... ON CONFLICT ... DO NOTHING` against the partial index, then reads the
 * canonical row if a concurrent transaction won the race. This is the standard
 * Postgres-safe mechanism and replaces the forbidden `findFirst → create` TOCTOU
 * pattern. All values are bound via Prisma.sql; no SQL is built from provider data.
 *
 * Soft-delete semantics: a soft-deleted row no longer occupies the identity (index
 * predicate `deleted_at IS NULL`), so rediscovery creates a NEW active Company. It
 * never resurrects the soft-deleted row. Company holds provider identity only; it is
 * never marked canonical/legally verified here (is_canonical stays false, and
 * jurisdiction/registrationNumber/taxVatId are not invented).
 */
async function resolveOrCreateCompany(
  tx: Prisma.TransactionClient,
  input: { importSourceId: string; providerRecordId: string; name: string },
): Promise<{ id: string }> {
  const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "companies" ("id", "name", "import_source_id", "provider_record_id", "updated_at")
    VALUES (
      ${randomUUID()},
      ${input.name.slice(0, COMPANY_NAME_MAX_LENGTH)},
      ${input.importSourceId},
      ${input.providerRecordId},
      now()
    )
    ON CONFLICT ("import_source_id", "provider_record_id") WHERE "deleted_at" IS NULL
    DO NOTHING
    RETURNING "id"
  `);
  const insertedRow = inserted[0];
  if (insertedRow !== undefined) {
    return insertedRow;
  }

  const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "companies"
    WHERE "import_source_id" = ${input.importSourceId}
      AND "provider_record_id" = ${input.providerRecordId}
      AND "deleted_at" IS NULL
    LIMIT 1
  `);
  const existingRow = existing[0];
  if (existingRow === undefined) {
    throw new Error(
      `Company identity not resolvable for (importSourceId=${input.importSourceId}, providerRecordId=${input.providerRecordId})`,
    );
  }
  return existingRow;
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

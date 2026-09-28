import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type {
  ContactPromotionEvidence,
  PromotionStatus,
  SocialPromotionEvidence,
  WebsitePromotionEvidence,
} from '../../domain/entities/canonical-evidence.js';
import {
  CanonicalPromotionRepository,
  type PromotionResult,
} from '../../domain/ports/canonical-promotion.repository.js';

const TITLE_MAX_LENGTH = 500;
const DESCRIPTION_MAX_LENGTH = 2000;
const VALUE_MAX_LENGTH = 500;
const HANDLE_MAX_LENGTH = 255;

/**
 * Promotes observed evidence into canonical Company-owned facts.
 *
 * The canonical rows (websites, contact_methods, social_profiles) and the
 * company link rows are created idempotently under concurrency:
 *
 * - Canonical identity is enforced by soft-delete-aware partial unique indexes
 *   (uq_websites_domain_active, uq_contact_methods_type_value_active,
 *   uq_social_profiles_platform_url_active; docs/DATABASE_RULES.md #12-#14).
 *   Prisma cannot target partial indexes, so the proven `INSERT ... ON CONFLICT
 *   ... WHERE deleted_at IS NULL ... DO NOTHING` + read-back pattern is used
 *   (the same approach as Company identity in prisma-search-persistence).
 * - Company links use their full composite unique constraints
 *   (uq_company_*_company_id_*_id) with `ON CONFLICT DO NOTHING`.
 * - A soft-deleted canonical row no longer occupies its partial index, so a
 *   repeated promotion creates a NEW active row (it never resurrects the
 *   soft-deleted one). Soft-deleted link rows are left untouched.
 *
 * All values are bound via Prisma.sql — no SQL is ever built from provider data.
 */
@Injectable()
export class PrismaCanonicalPromotionRepository implements CanonicalPromotionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async promoteWebsite(companyId: string, promotion: WebsitePromotionEvidence): Promise<PromotionResult> {
    const row: { id: string; created: boolean } = await this.prisma.client.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "websites" (
          "id", "domain", "url", "title", "description", "tech_hints",
          "evidence_source", "evidence_url", "observed_at", "updated_at"
        )
        VALUES (
          ${randomUUID()},
          ${promotion.domain},
          ${promotion.url ?? null},
          ${promotion.title?.slice(0, TITLE_MAX_LENGTH) ?? null},
          ${promotion.description?.slice(0, DESCRIPTION_MAX_LENGTH) ?? null},
          CAST(${JSON.stringify(promotion.techHints ?? [])} AS json),
          ${promotion.evidenceSource ?? null},
          ${promotion.evidenceUrl ?? null},
          ${promotion.observedAt ?? null},
          now()
        )
        ON CONFLICT ("domain") WHERE "deleted_at" IS NULL
        DO NOTHING
        RETURNING "id"
      `);
      const insertedRow = inserted[0];
      if (insertedRow !== undefined) {
        await this.insertCompanyWebsite(tx, companyId, insertedRow.id);
        return { id: insertedRow.id, created: true };
      }

      const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "websites"
        WHERE "domain" = ${promotion.domain} AND "deleted_at" IS NULL
        LIMIT 1
      `);
      const existingRow = existing[0];
      if (existingRow === undefined) {
        throw new Error(`Website identity not resolvable for domain=${promotion.domain}`);
      }
      await this.insertCompanyWebsite(tx, companyId, existingRow.id);
      return { id: existingRow.id, created: false };
    });

    return { status: statusOf(row) };
  }

  async promoteContactMethod(companyId: string, promotion: ContactPromotionEvidence): Promise<PromotionResult> {
    const typeId = await this.contactMethodTypeId(promotion.type);
    if (typeId === undefined) {
      // Unknown lookup code — the value is observed but not supported by the
      // current implementation. Do not invent a type.
      return { status: 'LINKED' };
    }

    const row: { id: string; created: boolean } = await this.prisma.client.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "contact_methods" (
          "id", "type_id", "value", "country_code",
          "evidence_source", "evidence_url", "observed_at", "updated_at"
        )
        VALUES (
          ${randomUUID()},
          ${typeId},
          ${promotion.value.slice(0, VALUE_MAX_LENGTH)},
          ${promotion.countryCode ?? null},
          ${promotion.evidenceSource ?? null},
          ${promotion.evidenceUrl ?? null},
          ${promotion.observedAt ?? null},
          now()
        )
        ON CONFLICT ("type_id", "value") WHERE "deleted_at" IS NULL
        DO NOTHING
        RETURNING "id"
      `);
      const insertedRow = inserted[0];
      if (insertedRow !== undefined) {
        await this.insertCompanyContactMethod(tx, companyId, insertedRow.id);
        return { id: insertedRow.id, created: true };
      }

      const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "contact_methods"
        WHERE "type_id" = ${typeId} AND "value" = ${promotion.value} AND "deleted_at" IS NULL
        LIMIT 1
      `);
      const existingRow = existing[0];
      if (existingRow === undefined) {
        throw new Error(`ContactMethod identity not resolvable for (type=${promotion.type}, value=${promotion.value})`);
      }
      await this.insertCompanyContactMethod(tx, companyId, existingRow.id);
      return { id: existingRow.id, created: false };
    });

    return { status: statusOf(row) };
  }

  async promoteSocialProfile(companyId: string, promotion: SocialPromotionEvidence): Promise<PromotionResult> {
    const platformId = await this.socialPlatformId(promotion.platform);
    if (platformId === undefined) {
      return { status: 'LINKED' };
    }

    const row: { id: string; created: boolean } = await this.prisma.client.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "social_profiles" (
          "id", "platform_id", "handle", "profile_url",
          "evidence_source", "evidence_url", "observed_at", "updated_at"
        )
        VALUES (
          ${randomUUID()},
          ${platformId},
          ${promotion.handle?.slice(0, HANDLE_MAX_LENGTH) ?? null},
          ${promotion.profileUrl},
          ${promotion.evidenceSource ?? null},
          ${promotion.evidenceUrl ?? null},
          ${promotion.observedAt ?? null},
          now()
        )
        ON CONFLICT ("platform_id", "profile_url") WHERE "deleted_at" IS NULL
        DO NOTHING
        RETURNING "id"
      `);
      const insertedRow = inserted[0];
      if (insertedRow !== undefined) {
        await this.insertCompanySocialProfile(tx, companyId, insertedRow.id);
        return { id: insertedRow.id, created: true };
      }

      const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "social_profiles"
        WHERE "platform_id" = ${platformId} AND "profile_url" = ${promotion.profileUrl} AND "deleted_at" IS NULL
        LIMIT 1
      `);
      const existingRow = existing[0];
      if (existingRow === undefined) {
        throw new Error(
          `SocialProfile identity not resolvable for (platform=${promotion.platform}, url=${promotion.profileUrl})`,
        );
      }
      await this.insertCompanySocialProfile(tx, companyId, existingRow.id);
      return { id: existingRow.id, created: false };
    });

    return { status: statusOf(row) };
  }

  private async contactMethodTypeId(code: string): Promise<string | undefined> {
    const rows = await this.prisma.client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "contact_method_types"
      WHERE "code" = ${code} AND "is_active" = true
      LIMIT 1
    `);
    return rows[0]?.id;
  }

  private async socialPlatformId(code: string): Promise<string | undefined> {
    const rows = await this.prisma.client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "social_platforms"
      WHERE "code" = ${code} AND "is_active" = true
      LIMIT 1
    `);
    return rows[0]?.id;
  }

  private async insertCompanyWebsite(
    tx: Prisma.TransactionClient,
    companyId: string,
    websiteId: string,
  ): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO "company_websites" ("id", "company_id", "website_id", "updated_at")
      VALUES (${randomUUID()}, ${companyId}, ${websiteId}, now())
      ON CONFLICT ("company_id", "website_id") DO NOTHING
    `);
  }

  private async insertCompanyContactMethod(
    tx: Prisma.TransactionClient,
    companyId: string,
    contactMethodId: string,
  ): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO "company_contact_methods" ("id", "company_id", "contact_method_id", "updated_at")
      VALUES (${randomUUID()}, ${companyId}, ${contactMethodId}, now())
      ON CONFLICT ("company_id", "contact_method_id") DO NOTHING
    `);
  }

  private async insertCompanySocialProfile(
    tx: Prisma.TransactionClient,
    companyId: string,
    socialProfileId: string,
  ): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO "company_social_profiles" ("id", "company_id", "social_profile_id", "updated_at")
      VALUES (${randomUUID()}, ${companyId}, ${socialProfileId}, now())
      ON CONFLICT ("company_id", "social_profile_id") DO NOTHING
    `);
  }
}

function statusOf(row: { created: boolean }): PromotionStatus {
  return row.created ? 'CREATED' : 'LINKED';
}

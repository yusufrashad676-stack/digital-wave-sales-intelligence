-- R2: Durable Company provider identity.
--
-- Companies discovered by search get a deterministic canonical identity:
--
--     (import_source_id, provider_record_id)
--
-- enforced at the database level by a soft-delete-aware PARTIAL unique index. A partial
-- index is required (rather than @@unique([importSourceId, providerRecordId, deletedAt]))
-- because Postgres treats NULLs as distinct in unique indexes, so a compound constraint
-- containing deleted_at would be a no-op for the ACTIVE rows we actually care about.
-- This follows ADR-005 / the existing convention in docs/DATABASE_RULES.md
-- "SQL Partial Index Registry" (cf. uq_leads_user_provider_active).
--
-- Both new columns are nullable:
--   * hand-curated / canonical companies are NOT keyed by provider identity, and
--   * NULLs are distinct, so legal-entity companies never collide with discovery rows.
--
-- This is provider identity ONLY. It does NOT imply legal-entity / business-registration
-- equivalence; it does not backfill registrationNumber/jurisdiction/taxVatId, and it does
-- not promote is_canonical. Legacy import_source_ref is not the identity mechanism and is
-- left untouched.
--
-- Additive only: no data backfill, no row mutation.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "import_source_id" TEXT,
ADD COLUMN "provider_record_id" VARCHAR(512);

-- AddForeignKey
ALTER TABLE "companies"
  ADD CONSTRAINT "companies_import_source_id_fkey"
  FOREIGN KEY ("import_source_id") REFERENCES "import_sources"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Soft-delete-aware uniqueness for provider identity: at most one ACTIVE company per
-- (import_source_id, provider_record_id). A soft-deleted row no longer occupies the
-- identity, so rediscovery after soft delete creates a NEW active Company (deliberate;
-- see R2 report, "Soft delete semantics").
CREATE UNIQUE INDEX "uq_companies_provider_identity_active"
  ON "companies" ("import_source_id", "provider_record_id")
  WHERE "deleted_at" IS NULL;
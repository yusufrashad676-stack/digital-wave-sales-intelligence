-- Soft-delete-aware uniqueness for saved leads: one active lead per user per
-- provider record. NULLs are distinct in Postgres, so a partial index (not
-- @@unique([userId, providerRecordId, deletedAt])) is required (ADR-005).
-- Registry: DATABASE_RULES.md SQL Partial Index Registry (#10).
CREATE UNIQUE INDEX "uq_leads_user_provider_active"
  ON "leads" ("user_id", "provider_record_id")
  WHERE "deleted_at" IS NULL;

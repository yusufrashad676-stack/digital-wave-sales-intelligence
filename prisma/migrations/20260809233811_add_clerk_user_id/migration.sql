-- AlterTable
ALTER TABLE "users" ADD COLUMN     "clerk_user_id" VARCHAR(255);

-- Soft-delete-aware uniqueness via SQL partial unique index (ADR-005 pattern).
-- Registered in docs/DATABASE_RULES.md "SQL Partial Index Registry".

CREATE UNIQUE INDEX "uq_users_clerk_id_active"
  ON "users"("clerk_user_id")
  WHERE clerk_user_id IS NOT NULL AND deleted_at IS NULL;

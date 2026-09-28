-- R3 — Canonical evidence foundation.
--
-- 1. Minimal provenance on canonical fact tables (Website, ContactMethod,
--    SocialProfile): evidence_source / evidence_url / observed_at. All NULL-able
--    (NULL = unobserved, never a fabricated lineage).
-- 2. Soft-delete-aware uniqueness (SQL partial unique indexes, ADR-005) so
--    concurrent canonical promotion can use the proven ON CONFLICT pattern and
--    repeated promotion of an observed fact never duplicates the active row.
--    Registered in docs/DATABASE_RULES.md "SQL Partial Index Registry"
--    (#12 websites, #13 contact_methods, #14 social_profiles).
-- 3. Idempotent lookup seeds for the contact-method and social-platform values
--    actually supported by the current enrichment implementation.

-- ---------------------------------------------------------------------------
-- 1. Provenance columns (nullable)
-- ---------------------------------------------------------------------------

ALTER TABLE "websites"
  ADD COLUMN "evidence_source" VARCHAR(255),
  ADD COLUMN "evidence_url" VARCHAR(2048),
  ADD COLUMN "observed_at" TIMESTAMPTZ;

ALTER TABLE "contact_methods"
  ADD COLUMN "evidence_source" VARCHAR(255),
  ADD COLUMN "evidence_url" VARCHAR(2048),
  ADD COLUMN "observed_at" TIMESTAMPTZ;

ALTER TABLE "social_profiles"
  ADD COLUMN "evidence_source" VARCHAR(255),
  ADD COLUMN "evidence_url" VARCHAR(2048),
  ADD COLUMN "observed_at" TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Partial unique indexes (soft-delete-aware)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "uq_websites_domain_active"
  ON "websites"("domain")
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_contact_methods_type_value_active"
  ON "contact_methods"("type_id", "value")
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_social_profiles_platform_url_active"
  ON "social_profiles"("platform_id", "profile_url")
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Idempotent lookup seeds (minimum supported values)
-- ---------------------------------------------------------------------------

INSERT INTO "contact_method_types" ("id", "code", "name", "description", "sort_order", "is_active", "updated_at")
VALUES
  (gen_random_uuid(), 'phone', 'Phone', 'Primary telephone number', 1, TRUE, now()),
  (gen_random_uuid(), 'email', 'Email', 'Primary email address', 2, TRUE, now())
ON CONFLICT ("code") DO NOTHING;

-- Platforms actually detected by the current implementation:
--   HttpSocialDiscoveryProvider.SOCIAL_HOSTS and
--   HttpWebsiteEnrichmentProvider.SOCIAL_DOMAINS both map exactly these 8.
INSERT INTO "social_platforms" ("id", "code", "name", "description", "sort_order", "is_active", "updated_at")
VALUES
  (gen_random_uuid(), 'facebook', 'Facebook', 'Facebook profile or page', 1, TRUE, now()),
  (gen_random_uuid(), 'instagram', 'Instagram', 'Instagram profile', 2, TRUE, now()),
  (gen_random_uuid(), 'linkedin', 'LinkedIn', 'LinkedIn company page', 3, TRUE, now()),
  (gen_random_uuid(), 'twitter', 'Twitter / X', 'Twitter (X) profile', 4, TRUE, now()),
  (gen_random_uuid(), 'youtube', 'YouTube', 'YouTube channel', 5, TRUE, now()),
  (gen_random_uuid(), 'tiktok', 'TikTok', 'TikTok profile', 6, TRUE, now()),
  (gen_random_uuid(), 'pinterest', 'Pinterest', 'Pinterest profile', 7, TRUE, now()),
  (gen_random_uuid(), 'snapchat', 'Snapchat', 'Snapchat profile', 8, TRUE, now())
ON CONFLICT ("code") DO NOTHING;
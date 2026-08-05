-- Soft-delete-aware uniqueness via SQL partial unique indexes.
-- Registered in docs/DATABASE_RULES.md "SQL Partial Index Registry" (ADR-005/006/007).

CREATE UNIQUE INDEX "uq_companies_canonical_jurisdiction_registration_number"
  ON "companies"("jurisdiction", "registration_number")
  WHERE deleted_at IS NULL AND is_canonical = true;

CREATE UNIQUE INDEX "uq_tags_name_active"
  ON "tags"("name")
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_categories_parent_name_active"
  ON "categories"("parent_id", "name")
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_branches_company_hq"
  ON "branches"("company_id")
  WHERE is_hq = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_company_addresses_primary_per_role"
  ON "company_addresses"("company_id", "role")
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_branch_addresses_primary_per_role"
  ON "branch_addresses"("branch_id", "role")
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_person_contact_methods_method_active"
  ON "person_contact_methods"("contact_method_id")
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_company_contact_methods_method_active"
  ON "company_contact_methods"("contact_method_id")
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_branch_contact_methods_method_active"
  ON "branch_contact_methods"("contact_method_id")
  WHERE deleted_at IS NULL;

# DATABASE_RULES.md

## Purpose

This document defines how we design, evolve, and maintain the PostgreSQL
schema behind the application. It is the contract between the ORM layer and the
domain. Every schema change must respect these rules.

## Database Philosophy

- PostgreSQL is the source of truth for data. No second system of record.
- **Schema-first:** `prisma/schema.prisma` is the only schema definition.
  Hand-written SQL DDL and `db push` for schema changes are forbidden in
  committed code — migrations are generated from the schema.
- All database access goes through Prisma, and only through
  `infrastructure/repositories/`. No raw queries outside repositories.
- The schema is a persistence detail: Prisma model names/types never leak into
  domain entities (ARCHITECTURE.md).
- Every table is auditable: creation, modification, and deletion are traceable.

## Primary Keys

- **UUID primary keys** for every table. Never auto-increment integers as PKs.
- Generate UUIDs in the application layer (v4) or via Prisma
  `@default(uuid())` at insert time; prefer application generation so the value
  is available before persistence.
- Rationale: collision-free across distributed writes, unguessable IDs are not
  exposed in URLs, and migrations/merges never collide.

```prisma
model User {
  id   String @id @default(uuid())
  // ...
}
```

- Composite unique keys are allowed only as *unique constraints*, never as
  primary keys (see Unique Constraints).

## Timestamps

- Every table has `createdAt` and `updatedAt`.

```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

- `updatedAt` is maintained automatically by Prisma.
- All timestamps are stored as `DateTime` (TIMESTAMPTZ). Never use strings for
  timestamps; never store local time without a zone.

## Soft Delete

- All user-facing domain data uses **soft delete**. Hard deletes are only
  allowed for ephemeral data (logs, token blacklists, job queues) and must be
  justified in review.
- Every soft-deletable table has `deletedAt`.

```prisma
model User {
  // ...
  deletedAt DateTime? @db.Timestamptz
}
```

- Read paths must filter out soft-deleted rows by default (a global Prisma
  query extension / scoped filter in the repository layer).
- `updatedAt` must be touched on soft delete so it stays truthful.
- Queries that must include deleted rows are explicit exceptions (`includeDeleted: true`).

## Indexes

- Every foreign key column gets an index.
- Every column used in a `where`, `orderBy`, or join filter gets an index when
  the table is expected to exceed a few thousand rows.
- Index naming is explicit in the schema:

```prisma
@@index([workspaceId, createdAt], map: "idx_user_workspace_created_at")
@@index([email], map: "idx_user_email")
```

- Composite indexes follow query patterns (leftmost prefix rule): index
  `[workspaceId, status]` supports `WHERE workspaceId = ?` and
  `WHERE workspaceId = ? AND status = ?`.
- Do not index columns that are never filtered. Do not stack redundant indexes.

## Foreign Keys

- Every relational link is expressed as a real foreign key with
  `onDelete` policy chosen explicitly:

```prisma
model Branch {
  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  companyId String
}
```

- Soft-deleted parents never cascade a hard delete. When a parent is
  soft-deleted, children are soft-deleted in the same use-case transaction.
- `onDelete` is `Restrict` (default) unless a deliberate, reviewed decision
  chooses `Cascade` or `SetNull`.

## Unique Constraints

- Business identity (email, slug, external reference keys) is enforced with
  unique constraints at the database level — application checks are not enough.
- **Join-table pair identity** is enforced with a plain composite `@@unique`
  on the join's owner + linked columns (e.g. `@@unique([companyId, tagId])`).
  Pair identity holds across active **and** soft-deleted rows, so re-assigning a
  pair after a soft-delete is a **restore** of the existing row, never a new
  insert (documented in ADR-005).
- **"Unique among non-deleted rows" is NEVER expressed with
  `@@unique([field, deletedAt])`.** That pattern is broken on PostgreSQL: NULLs
  are treated as distinct, so multiple active rows (`deletedAt = NULL`) are all
  admitted, defeating the constraint.
- The correct mechanism for soft-delete-aware uniqueness is a **SQL partial
  unique index** (`CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`), created
  in a follow-up migration on top of the Prisma-generated migration
  (ADR-005). Prisma remains the source of models; SQL is the source of advanced
  indexes. Every such index is registered in the **SQL Partial Index Registry**
  below so the schema review checklist accounts for it.

## Naming Conventions (tables & columns)

- **Tables:** plural, snake_case via `@@map` if Prisma model names differ from
  DB naming (`@@map("social_profiles")`). Prisma model names stay singular
  PascalCase.
- **Columns:** snake_case via `@map` when needed; PascalCase in the Prisma
  schema is acceptable only if it matches, but we standardize on
  `camelCase` Prisma fields + `@map("snake_case")` for DB columns.
- **Boolean columns:** `is_*`, `has_*` (`is_active`).
- **Foreign key columns:** `<entity>_id` (`company_id`).
- **Index names:** `idx_<table>_<columns>`.
- **Constraint names:** use Prisma defaults or explicit
  `map: "uq_<table>_<column>"`.

## Audit Fields

Every table carries a minimal audit trail:

```prisma
model Company {
  // ...
  createdById String?
  createdBy   User?  @relation("CompanyCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
}
```

- `createdById` and `updatedById` are recorded on create/update.
- Full history (who changed what, when) is captured by the audit logging in
  SECURITY.md and a dedicated audit/event table where required by regulation —
  not by ad-hoc `History` tables per entity.

## SQL Partial Index Registry

Soft-delete-aware uniqueness and other PostgreSQL-only indexes are created via
SQL migrations that run **after** the corresponding Prisma migration (ADR-005).
Prisma cannot represent them. Keep this registry in sync with the live database:

| # | Table | Index name | Definition | Source |
|---|-------|------------|------------|--------|
| 1 | `companies` | `uq_companies_canonical_jurisdiction_registration_number` | `UNIQUE (jurisdiction, registration_number) WHERE deleted_at IS NULL AND is_canonical = true` | ADR-007, 01-company.md |
| 2 | `tags` | `uq_tags_name_active` | `UNIQUE (name) WHERE deleted_at IS NULL` | 10-tag.md (decision 8) |
| 3 | `categories` | `uq_categories_parent_name_active` | `UNIQUE (parent_id, name) WHERE deleted_at IS NULL` | 09-category.md (decision 7) |
| 4 | `branches` | `uq_branches_company_hq` | `UNIQUE (company_id) WHERE is_hq = true AND deleted_at IS NULL` | 02-branch.md |
| 5 | `company_addresses` | `uq_company_addresses_primary_per_role` | `UNIQUE (company_id, role) WHERE is_primary = true AND deleted_at IS NULL` | 03-address.md |
| 6 | `branch_addresses` | `uq_branch_addresses_primary_per_role` | `UNIQUE (branch_id, role) WHERE is_primary = true AND deleted_at IS NULL` | 03-address.md |
| 7 | `person_contact_methods` | `uq_person_contact_methods_method_active` | `UNIQUE (contact_method_id) WHERE deleted_at IS NULL` | ADR-006 (single owner) |
| 8 | `company_contact_methods` | `uq_company_contact_methods_method_active` | `UNIQUE (contact_method_id) WHERE deleted_at IS NULL` | ADR-006 (single owner) |
| 9 | `branch_contact_methods` | `uq_branch_contact_methods_method_active` | `UNIQUE (contact_method_id) WHERE deleted_at IS NULL` | ADR-006 (single owner) |

Future additions to this registry: expression/prefix indexes (name matching),
full-text (tsvector/trigram), and spatial indexes (ADR-008) when those features
ship. All are added via SQL migrations on top of the frozen Prisma schema.

## Migration Strategy

1. **Schema changes happen in `prisma/schema.prisma` only.**
2. Generate a migration with `npx prisma migrate dev` locally; the generated
   SQL is committed to `prisma/migrations/`.
3. **Production applies via `npx prisma migrate deploy`** — never `db push` in
   production, never `migrate dev` outside a local/dev environment.
4. Migrations are immutable once merged. To correct a migration, add a new one.
5. Destructive changes (drops, renames, not-null additions) must be additive
   two-step where needed: add column nullable → backfill → make not-null in a
   follow-up migration.
6. Renames are done as `add column` + `copy` + `drop` in separate steps, or via
   Prisma `migrate diff` review — never a raw destructive rename.
7. Every schema change is reviewed for index impact, soft-delete semantics, and
   audit fields before merge.
8. Seed data lives in a committed seed script and runs via
   `npx prisma db seed`; seeds are idempotent.

## What We Never Do

- ❌ `@@unique([field, deletedAt])` — broken NULL semantics on PostgreSQL; use
  SQL partial unique indexes instead (ADR-005).
- ❌ Auto-increment integer primary keys.
- ❌ Hard deletes on domain data without explicit review.
- ❌ `db push` in production.
- ❌ Editing migration SQL after it has been applied anywhere.
- ❌ Raw SQL in application code (`prisma.$queryRaw`) outside repositories,
  and even there only when Prisma cannot express the query — with review.
- ❌ Storing money/decimals as floats (`Decimal`).
- ❌ `TEXT`/unbounded columns where a bounded `String`/enum is correct.
- ❌ Enums stored as free strings where a Prisma `enum` or a
  `String` + `@db.VarChar` with a CHECK-like convention is required.
- ❌ Adding a table without `createdAt`, `updatedAt`, and (where applicable)
  `deletedAt`.
- ❌ Foreign keys without indexes.

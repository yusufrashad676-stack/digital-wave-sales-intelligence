# ADR-005 — Soft-Delete Uniqueness Implementation

## 1. Status

**Accepted** (DATABASE DESIGN FREEZE v1.0)

## 2. Context

Multiple entities carry uniqueness rules that must hold **only among non-deleted rows**:
Company registration number per jurisdiction, Category sibling names, Tag canonical name,
Branch HQ flag, registered-office role, and primary-flag joins. All of these use soft
delete (`deletedAt`), so the constraint is "unique among active rows".

Prisma's schema language cannot declare PostgreSQL **partial unique indexes**
(`CREATE UNIQUE INDEX … WHERE deleted_at IS NULL`). The commonly suggested
`@@unique([field, deletedAt])` pattern is broken on PostgreSQL: NULLs are treated as
distinct, so multiple active rows (`deletedAt = NULL`) are all admitted, defeating the
constraint.

## 3. Problem

Without a resolution, soft-deleted rows silently weaken uniqueness guarantees: the
intended "one active X" invariants (one HQ per company, one canonical Tag name, one
registration number per jurisdiction) cannot be expressed through the ORM alone, and
domain-level enforcement alone is racy under concurrent writes.

## 4. Decision

1. **Partial unique indexes are implemented as SQL migrations** that run **after** the
   corresponding Prisma-generated migration.
2. **Prisma remains the source of models** (tables, columns, relations, non-partial
   constraints).
3. **SQL is the source of advanced indexes** (partial unique indexes, expression indexes,
   and later spatial/full-text indexes).
4. Every SQL-added index is registered in DATABASE_RULES.md so the schema review checklist
   accounts for it.
5. **Join-table pair identity is the exception.** Join tables (CompanyTag, RolePermission,
   UserWorkspace, …) carry a **plain composite `@@unique`** on (owner, linked) columns.
   A pair identity is unique across active *and* soft-deleted rows, so re-assigning a pair
   after a soft-delete is a **restore** of the existing row (`deletedAt = NULL`), never a
   new insert. Single-row soft-delete uniqueness (Tag name, Category sibling, HQ flag,
   canonical registration number) still uses SQL partial indexes — items 1–9 of the
   registry.

## 5. Alternatives Considered

- **`@@unique([field, deletedAt])`** — rejected: broken NULL semantics on PostgreSQL
  (multiple active rows allowed).
- **Nullable dedupe key column** (`activeKey` set to a sentinel only for active rows,
  included in a normal unique index) — rejected: adds a schema-only column whose value is
  meaningless outside constraint mechanics, and the sentinel must still collide safely.
- **Mutate-on-delete of the natural key** (set `name = name + '—deleted:<id>'` on delete)
  — rejected: rewrites user-visible data and complicates restore/undo.
- **Generated active-only column** — rejected: works but hides intent behind a generated
  column; SQL migration is more explicit and keeps the schema honest.
- **Domain-layer enforcement only** — rejected: not concurrency-safe; uniqueness is a
  database guarantee.

## 6. Consequences

- Every soft-delete entity with a uniqueness rule carries an accompanying SQL migration —
  a new, required artifact type in the migration workflow.
- Migration ordering is a formal rule: Prisma migration first, SQL index migration second;
  reviewed together.
- Prisma `migrate diff` cannot represent these indexes; the SQL migration is the
  authoritative record and must be kept in sync by review, not tooling.
- Restoring from a Prisma-only baseline loses the partial indexes unless the SQL migration
  is replayed — documented in DATABASE_RULES.md migration strategy.

## 7. Trade-offs

- **Pro:** correct, explicit, PostgreSQL-native constraints; no schema-only columns; no
  user-visible data rewriting.
- **Con:** two sources of truth for the schema (Prisma models + SQL indexes) with a
  documented discipline to keep them aligned; CI must validate that all expected partial
  indexes exist.

## 8. Future Revisions

- Revisit if Prisma adds native partial unique index support (then migrate SQL indexes
  into the schema and remove the SQL artifacts).
- The same SQL-migration mechanism hosts future spatial (PostGIS) and full-text
  (tsvector/trigram) indexes — see ADR-008 and the search strategy.

---

Related: DATABASE_RULES.md (Soft Delete, Unique Constraints, Migration Strategy); blocking
B2 in DATABASE_REVIEW.md.

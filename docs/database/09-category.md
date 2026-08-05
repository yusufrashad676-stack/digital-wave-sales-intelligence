# Database Design — 09 · Category

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Category" ·
DATABASE_RULES.md

## Purpose

The Category entity is a controlled, product-managed business classification
applied to research objects (primarily Companies). It is a closed taxonomy —
categories are curated by the platform, not invented by end users — providing
stable segmentation, filtering, and reporting.

## Responsibilities

- Provide a bounded, managed set of classification labels.
- Support **hierarchical trees** of arbitrary depth (review decision 7).
- Carry a stable machine code so reporting and filtering never depend on
  human-readable labels.
- Underpin many-to-many classification of Companies (and, in future, other
  subjects).

## Fields

- **Identity:** id (UUID), name, code (stable machine key), description
  (optional).
- **Hierarchy:** parent id (optional, self-reference to another Category), sort
  order (within parent).
- **Status:** active flag.
- **Provenance:** created by (product/config context).
- **Timestamps:** created at, updated at, deleted at.

## Relationships

- Category → Category (0 to 1 parent : 0 to many children, self-reference).
  Trees are supported at arbitrary depth (review decision 7); no depth limit is
  imposed by the schema.
- Category → **`CompanyCategory`** (assignment join carrying assigned-by,
  assigned-at, source).
- Categories are not attached to Tags; the two are distinct classification
  systems.

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Category : Category (parent) | n : 0..1 | optional hierarchy |
| Category : children | 1 : 0..n | arbitrary depth tree |
| Company : CompanyCategory | n : m | assignment join |

## Constraints

- Name is required and non-empty.
- Code is required and unique (stable machine key; never reused after
  retirement).
- Parent reference must not create a cycle (a Category cannot be its own
  ancestor) — validated by the domain on create/reparent.
- Active flag defaults to true.
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **Code is globally unique** — codes are platform-managed identity keys, not
  subject to Duplicate Candidate resolution (they are not ingested data).
- **Name is unique among siblings** — unique on (parent id, name) among
  non-deleted records. Root categories are unique by (null parent, name). This
  supports the tree model (review decision 7) while allowing the same name in
  different branches.
- A retired category (soft-deleted) releases its name/code for future use only
  if the platform policy allows; by default codes are never reused.

## Index Strategy

- Unique index on code.
- Unique index on (parent id, name).
- Index on parent id for tree traversal (sibling queries, subtree walks).
- Index on the CompanyCategory join (company id) and (category id) for both
  directions of lookup.

## Validation Rules

- Name: length bounds, trimmed, human-readable, non-empty.
- Code: slug format (lowercase, hyphens/underscores), stable, non-empty.
- Parent reference must not create a cycle or self-reference.
- Description: length bound, plain text.
- No PII anywhere in taxonomy data.

## Business Rules

- The taxonomy is product-managed: end users assign categories, they do not
  invent them. User-requested categories go through a review process.
- Trees are supported; reparenting is an audited, reviewed operation that
  preserves descendant integrity.
- Assignments are audited (assigned-by, assigned-at, source); assignment
  confidence may be supplied by data-quality/ai, but assignment itself requires
  a reviewed action.
- AI may suggest categories as AI Suggestions; approval is required before an
  assignment is created.
- Retiring a category does not silently delete existing assignments — existing
  data is reviewed, reassigned, or explicitly excluded.

## Soft Delete Strategy

- Soft delete via deleted-at for categories and assignments.
- Default reads exclude deleted categories.
- Deleting a category requires resolving its existing assignments and its
  children (reassign, reparent, or delete) in the same use-case transaction;
  history is audited, not silently removed.

## Audit Fields

- created-by, updated-by, deleted-by.
- created-at, updated-at, deleted-at.
- Assignment records: assigned-by, assigned-at, source.
- Taxonomy changes (rename, reparent, retire) recorded in the Audit Log.

## Future Extension Notes

- Category versioning (a dated taxonomy snapshot for historical reporting).
- Synonyms/aliases for matching while keeping one canonical code.
- Per-workspace category subsets (which categories a tenant can see/assign) —
  tenant-ready by design.
- Expansion to Person/Branch classification via the same assignment pattern
  (e.g. PersonCategory, BranchCategory joins).

# Database Design — 10 · Tag

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Tag" ·
DATABASE_RULES.md

## Purpose

The Tag entity is a free-form, user-created label that can be attached to any
research object (Company, Person, Lead, and other subjects) for personal
organization. Unlike Category, Tags are unconstrained and user-generated; they
must never be used for integrity-critical queries.

## Responsibilities

- Provide lightweight, flexible labeling across heterogeneous subjects.
- Maintain a **global** normalized tag dictionary (review decision 8): the same
  concept is one tag, not ten variants, platform-wide.
- Support many-to-many assignment to any eligible subject type via explicit
  join tables.
- Underpin tag-based filtering, grouping, and reporting (non-critical).

## Fields

- **Identity:** id (UUID), name (normalized), display name (optional).
- **Presentation:** color (optional, UI-only), system flag (reserved for
  platform-managed tags).
- **Timestamps:** created at, updated at, deleted at.

## Relationships

Ownership/assignment is expressed exclusively through explicit join tables —
no polymorphic subject-type columns (review decision 1):

- **`CompanyTag`** — assigns a Tag to a Company. Carries assigned-by,
  assigned-at.
- **`PersonTag`** — assigns a Tag to a Person. Same metadata.
- Future subjects (Lead, Branch) get their own join tables (`LeadTag`,
  `BranchTag`) using the identical pattern.
- Tags are independent of Categories — separate classification systems with no
  relationship.

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Tag : CompanyTag | 1 : 0..n | global dictionary shared across subjects |
| Tag : PersonTag | 1 : 0..n | global dictionary shared across subjects |
| Subject : Tag | 1 : 0..n | via the subject's join table |

## Constraints

- Name is required, non-empty, and normalized (trim, case, character set) on
  save.
- A subject assignment requires a valid subject reference on its join table.
- Assignments are unique per subject + tag — tagging the same subject with the
  same tag twice is not permitted (enforced at each join table).
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **Normalized tag name is unique globally among non-deleted records (review
  decision 8)** — one global dictionary ("IT", "it", "IT " all converge to one
  tag). This uniqueness is on the dictionary entry (a platform-wide label), not
  on ingested entity identity, so it does not conflict with Duplicate Candidate
  resolution.
- Per-subject uniqueness is enforced at the join level, not on the Tag row.
- A soft-deleted tag may be recreated; existing assignments are resolved
  first.

## Index Strategy

- Unique index on normalized name (global dictionary).
- Index on each join table at its subject column (company id / person id) for
  tag lookups of a subject.
- Index on each join table at its tag column for reverse lookup of all subjects
  with a tag.
- Index on assigned-at for recency ordering.

## Validation Rules

- Name: length bounds, trimmed, allowed character set, normalization enforced
  (case-folding, whitespace collapsing).
- Display name: length bound, UI-only.
- No PII embedded in tag names; tags are metadata, not data storage.
- No HTML or scripts — tags are stored as data, never evaluated.

## Business Rules

- Tags are user-generated; the platform may manage a small reserved set
  (system flag) but does not curate user tags.
- Tags are never used for integrity-critical matching or identity; Category and
  Duplicate Candidate resolution serve those needs.
- Auto-tagging by AI creates AI Suggestions, never direct writes — approval
  required before assignments are created (AI rule).
- Deleting a tag does not hard-delete assignments silently; assignments are
  soft-deleted with the tag or explicitly reassigned.

## Soft Delete Strategy

- Soft delete via deleted-at on tags and on each assignment join.
- Default reads exclude deleted tags.
- Soft-deleting a subject soft-deletes its tag assignments in the same use-case
  transaction (no hard cascade).
- Tag merges (two tags into one) are audited bulk operations, not in-place
  rewrites.

## Audit Fields

- created-by, updated-by, deleted-by on tags and joins.
- created-at, updated-at, deleted-at.
- Assignment records: assigned-by, assigned-at, source.
- Tag merges and bulk operations recorded in the Audit Log.

## Future Extension Notes

- Tag aliases and merging workflows.
- Tag usage statistics (top tags, per workspace) as derived read models.
- Bulk tagging/untagging operations with full audit.
- Expansion to Branch/Website/Social Profile subjects via the same join-table
  pattern (LeadTag, BranchTag, etc.).

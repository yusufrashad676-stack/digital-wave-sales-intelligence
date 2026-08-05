# Database Design — 01 · Company (Organization)

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Organization" ·
DATABASE_RULES.md

## Purpose

The Company entity is the primary research target of the platform and the root
of the data hierarchy. It represents a distinct business organization operating
under a legal or commercial identity, independent of any single workspace in
v1 but shaped to be tenant-ready.

## Responsibilities

- Uniquely identify a business organization within the platform.
- Act as the root for Branches, digital presence, classification, and leads.
- Hold the canonical identity fields used for matching and enrichment.
- Provide the research subject against which Data Quality is measured.

## Fields

- **Identity:** id (platform-generated UUID), name, legal name (optional),
  trading name (optional).
- **Registration:** registration number (optional), tax/VAT identifier
  (optional), jurisdiction of registration (optional, ISO 3166-1 alpha-2).
- **Status:** lifecycle status — stable enumeration (active / inactive /
  dormant). Data Quality is derived by the data-quality module; it is not a
  stored field on this entity.
- **Canonical marker:** `isCanonical` boolean (default false) — set `true` only
  by duplicate-resolution (merge); the ADR-007 partial unique index targets it
  (see Unique Rules).
- **Anonymization:** anonymized-at timestamp (nullable), anonymization token id
  (nullable) — reserved for the future Person-side flow; retained here so the
  pattern is uniform (see Person design).
- **Provenance:** import source reference (from which Search Job / Import
  Source the record originated).
- **Timestamps:** created at, updated at, deleted at.

## Relationships

All ownership is expressed through explicit join tables — no polymorphic
owner-type columns:

- Company → Branch (1 to many; direct child).
- Company → Address (0 to many, **via `CompanyAddress`**; the registered office
  is represented by address-role metadata on that join).
- Company → Contact Method (0 to many, **via `CompanyContactMethod`**, office
  channels).
- Company → Website (0 to many, **via `CompanyWebsite`**).
- Company → Social Profile (0 to many, **via `CompanySocialProfile`**).
- Company → Category (0 to many, **via `CompanyCategory`**).
- Company → Tag (0 to many, **via `CompanyTag`**).
- Company → Person (0 to many, **only through Employment — never direct**).
- Company → Lead (1 to many).

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Company : Branch | 1 : n | Branch belongs to exactly one Company |
| Company : CompanyAddress | 1 : 0..n | one registered office per Company |
| Company : CompanyContactMethod | 1 : 0..n | office channels |
| Company : CompanyWebsite | 1 : 0..n | Websites are independent entities |
| Company : CompanySocialProfile | 1 : 0..n | Independent of Website |
| Company : CompanyCategory | 1 : 0..n | assignment join |
| Company : CompanyTag | 1 : 0..n | assignment join |
| Company : Person | 1 : 0..n | only via Employment |

## Constraints

- Name is required and non-empty.
- id is required and immutable once created.
- A Company may exist with no registration data (sole traders, unregistered
  entities) — registration fields are optional but, if present, must be
  coherent with jurisdiction.
- Lifecycle status is drawn from the approved stable enumeration.
- Timestamps are system-maintained; deleted-at is null while active.

## Unique Rules

- **No natural unique key on name.** Company names are not globally unique
  (e.g. "Acme GmbH" exists in many countries). Identity is resolved by
  **Duplicate Candidate**, never by database uniqueness (per review decision 4).
- **Registration number uniqueness is scoped by jurisdiction** (review decision
  13): the composite (jurisdiction, registration number) is unique among
  **canonical, non-deleted** records (`is_canonical = true AND deleted_at IS NULL`),
  enforced only when registration number is present. It is implemented as a SQL
  partial unique index (ADR-005/ADR-007), never as a Prisma `@@unique`, so raw
  ingestion of pre-merge duplicates is never blocked. Registration number is
  therefore usable as a first-party identity signal without conflicting with
  cross-jurisdiction duplicates.
- No other uniqueness is enforced on identity fields; all remaining duplicate
  resolution is the Duplicate Candidate's responsibility.
- Where a future tenant boundary exists, identity keys remain globally unique
  (UUID), not per-workspace unique.

## Index Strategy

- Index on name (prefix) for name-based search and matching.
- Unique index on (jurisdiction, registration number) where registration number
  is present.
- Index on lifecycle status to support list filters.
- Index on created-at for recency ordering (default list sort).
- Index on created-by (audit queries).
- Reserve a tenant/workspace column and its index for the future root boundary.

## Validation Rules

- Name: length bounds, allowed character set, trimming; no whitespace-only
  values; no control characters.
- Registration / tax identifiers: format validated per jurisdiction when the
  jurisdiction is known.
- Country/jurisdiction: ISO 3166-1 alpha-2 when stored.
- No PII: Company identity fields must not embed personal data (a personal
  email address is a Contact Method, not a Company field).

## Business Rules

- A Company must have at least a name before it can be created.
- Creation is allowed only through the approved ingestion path (Search Job /
  Raw Import / manual review), never silently by data-quality or ai.
- Duplicates are never auto-merged: resolution goes through a Duplicate
  Candidate and an audited decision.
- Data Quality and per-fact verification state are computed and owned by the
  data-quality module; they are never stored on or hand-edited via this entity.
- AI never writes Company fields directly; AI Suggestions require approval.

## Soft Delete Strategy

- Soft delete via deleted-at timestamp. A soft-deleted Company is excluded from
  all default reads and from duplicate detection.
- Related Branches, joins (addresses, websites, profiles, categories, tags),
  and Employment records are soft-deleted in the same use-case transaction
  (no hard cascade).
- Re-activation restores the Company without recreating identity.

## Audit Fields

- created-by, updated-by, deleted-by (actor references).
- created-at, updated-at, deleted-at.
- Provenance of initial creation (Import Source / user / manual entry).
- All identity changes (merge survivor selection, renames) recorded in the
  Audit Log; merge operations additionally record before/after state.

## Future Extension Notes

- Multi-language names (name per locale) with a canonical name.
- Financial and hiring enrichment (employee count, revenue band) as derived
  snapshots, not core fields.
- Workspace/Tenant root boundary: ownership and access scoping columns added
  without remodeling identity.
- Merge support: survivor record + tombstone references to consumed duplicate
  records.

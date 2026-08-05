# Database Design — 04 · Person

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Person" ·
DATABASE_RULES.md

## Purpose

The Person entity is a **global** entity: a human being who is a point of
contact within, or related to, one or more Companies. People are platform-wide
assets and never belong to a Company directly — the only link is through
Employment.

## Responsibilities

- Hold the canonical identity of a human subject.
- Own Contact Methods (the reachable channels), via explicit joins.
- Be the subject of Employment records, Social Profiles, Verification, AI
  Insights, Tasks, and Activities.
- Be the object of Duplicate Detection (two Person rows may refer to the same
  human).
- Support future anonymization of its PII without breaking referential
  integrity.

## Fields

- **Identity:** id (UUID), first name, last name, middle name (optional).
- **Derived display:** display name (derived, not user-editable as source of
  truth).
- **Optional identity hints:** preferred language (optional), photo reference
  (optional, URL reference only).
- **Anonymization (review decision 11):** anonymized-at timestamp (nullable),
  anonymization token id (nullable). When set, all PII fields (names, photo,
  language) are scrubbed to placeholders and the row becomes a structural shell
  preserving referential integrity.
- **Provenance:** import source reference.
- **Timestamps:** created at, updated at, deleted at.

## Relationships

All ownership is expressed through explicit join tables — no polymorphic
owner-type columns:

- Person → Contact Method (1 to many, **via `PersonContactMethod`**; owned,
  never the reverse).
- Person → Employment (0 to many; the only link to Companies/Branches).
- Person → Social Profile (0 to many, **via `PersonSocialProfile`**;
  independent of Website).
- Person → Company (0 to many, **only through Employment — never direct**).
- Person → Lead, Task, Activity, AI Insight (as subject).

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Person : PersonContactMethod | 1 : 1..n | reachable through at least one channel in practice |
| Person : Employment | 1 : 0..n | zero when not yet matched to a Company |
| Person : Company | 1 : 0..n | only via Employment, never direct |
| Person : PersonSocialProfile | 1 : 0..n | independent presence |
| Person : Lead | 1 : 0..n | as wrapped subject |

## Constraints

- At least one of first name or last name is required while not anonymized; a
  fully unnamed Person record is invalid.
- id is immutable once created.
- No direct Company reference is permitted on the Person row — this is a
  structural invariant (enforced by the domain, not by a nullable FK).
- Anonymization state is mutually exclusive with live PII: setting the
  anonymized-at timestamp requires scrubbing PII fields in the same
  transaction.
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **No global natural unique key.** Names collide; identity is resolved by
  Duplicate Candidate using name + Contact Method + Employment signals (review
  decision 4). No database uniqueness on identity fields.
- No uniqueness is enforced on (first name, last name).
- Email/phone uniqueness is explicitly **not** enforced (review decision 3);
  value equality is a Duplicate Candidate signal only.
- Person identity is globally unique (UUID) and must remain so under any future
  tenant boundary (a Person is shared/global, not workspace-owned).

## Index Strategy

- Index on last name + first name for matching and search.
- Index on name prefix for autocomplete-style search.
- Index on provenance source for ingestion lookups.
- Index on created-at for recency ordering.
- Index on anonymization state for compliance sweeps (find/scrub/verify).
- Future: identity-graph and fuzzy-match supporting indexes.

## Validation Rules

- Names: length bounds, trimmed, allowed character set (multi-script support);
  no whitespace-only values.
- Optional fields (language, photo reference) validated against allowed
  enumerations/URL rules.
- No sensitive data stored as core Person fields; anything sensitive is a
  Contact Method or an opt-in attribute governed by SECURITY.md.
- Anonymization token: generated, non-reversible, non-PII.

## Business Rules

- A Person is never created as a child of a Company; Companies reference
  Persons only through Employment.
- Duplicate People are resolved via Duplicate Candidate and an audited merge
  (survivor selection); no auto-merge.
- Contact Method is owned by the Person (via PersonContactMethod) and is never
  a subject of Tasks or Activities on its own.
- AI never edits Person identity directly; AI Suggestions require approval.
- **Anonymization (review decision 11):** anonymization is the platform's
  mechanism for data-removal compliance. It replaces PII with placeholders,
  marks the row anonymized, and is fully audited. Hard delete remains the
  explicit, reviewed exception (see Soft Delete). Verification/confidence state
  for the Person is owned by data-quality and is purged or detached per policy.

## Soft Delete Strategy

- Soft delete via deleted-at. Default reads exclude deleted Persons.
- PersonContactMethod and PersonSocialProfile joins, plus Employment records,
  are soft-deleted with the Person in the same use-case transaction (no hard
  cascade).
- A soft-deleted Person is excluded from Duplicate Detection and from new
  Employment matches.
- Right-to-erasure uses **anonymization first** (structural shell retained);
  hard delete is the explicit, reviewed exception.

## Audit Fields

- created-by, updated-by, deleted-by.
- created-at, updated-at, deleted-at, anonymized-at.
- Provenance of initial creation.
- Merge operations (survivor + absorbed records) fully audited with
  before/after state.
- Anonymization events audited (actor, timestamp, scope of scrubbed fields).

## Future Extension Notes

- Identity graph (same human across records) improving Duplicate Detection.
- Multi-script and localized name handling.
- Global, tenant-shared Person model: workspace scoping applies to research
  links and usage, not to Person identity.
- Optional privacy attributes (opt-ins, preferences) under SECURITY.md policy.
- PersonAddress join when Person business locations are needed.

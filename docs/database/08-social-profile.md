# Database Design — 08 · Social Profile

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Social Profile" ·
DATABASE_RULES.md

## Purpose

The Social Profile entity represents a claimed or verified presence of a
Person, Company, or Branch on a third-party social or professional network. It
is an **independent digital-presence entity** — never a Website, never a
Contact Method. It supports enrichment, verification, and outreach.

## Responsibilities

- Represent a network account with platform-specific identity (handle, URL,
  profile id).
- Be the target of profile Verification (is this account genuinely the
  claimed entity's) — state owned by the data-quality module.
- Provide enrichment signals (display name, activity) as derived data.
- Distinguish public profile pages (Social Profile) from private messenger
  handles (Contact Method).

## Fields

- **Identity:** id (UUID).
- **Platform:** reference to the **social-platform lookup table** (linkedin /
  x / facebook / instagram / extensible future networks — review decision 6).
- **Account:** handle, profile URL (canonical per platform), platform profile
  id (optional, stable).
- **Captured metadata:** display name (optional), activity snapshot fields
  (optional, derived, e.g. follower/connection counts at a point in time).
- **Provenance:** import source reference.
- **Timestamps:** created at, updated at, deleted at.

**No ownership columns on this entity.** Ownership lives on the join tables
below (review decision 1).

## Relationships

Ownership is expressed exclusively through explicit join tables:

- **`PersonSocialProfile`** — links a Social Profile to a Person. Carries:
  primary flag, assigned-by, assigned-at.
- **`CompanySocialProfile`** — links a Social Profile to a Company (company
  pages).
- **`BranchSocialProfile`** — links a Social Profile to a Branch (independent
  presence only).
- Social Profile → Verification (0 to many; genuineness checks, owned by the
  data-quality module).
- Social Profile is **independent of Website** — no relationship between the
  two entity types.

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Person : PersonSocialProfile | 1 : 0..n | one profile per network per person |
| Company : CompanySocialProfile | 1 : 0..n | company pages |
| Branch : BranchSocialProfile | 1 : 0..n | independent presence only |
| Social Profile : joins | 1 : 0..n | the same network account across subjects |

## Constraints

- Platform reference is required and drawn from the social-platform lookup
  table; unknown networks are rejected.
- At least one of handle or platform profile id is required; a profile URL is
  strongly recommended.
- Profile URL is canonicalized per platform (normalized form stored once).
- A Social Profile row may exist unowned during import, but must be resolved
  through a join before it contributes to identity.
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **No database uniqueness on platform account identity (review decision 4).**
  Duplicate (platform, profile id / handle) rows can arise during ingestion;
  they are a strong **Duplicate Candidate** signal, not a constraint error.
- The same Person across two networks is two Social Profiles, not one.
- A soft-deleted profile may be re-claimed as a new row.

## Index Strategy

- Non-unique index on (platform, platform profile id) for lookup and matching.
- Non-unique index on (platform, canonical handle) where the platform exposes a
  stable handle.
- Index on the join tables at their owner columns (person id / company id /
  branch id).

## Validation Rules

- Platform from the social-platform lookup table; unknown networks rejected.
- Handle and URL validated against the platform's expected pattern; URL
  canonicalization per platform.
- Captured metadata (display name, counts) stored as data, never evaluated;
  length and type bounds enforced.
- No access tokens or secrets stored on the row (see SECURITY.md); tokens, when
  ever used, live in secured integration storage.

## Business Rules

- Social Profile is independent from Website: a profile is never a Website row
  and a domain is never a profile row.
- Public profile pages belong to Social Profile; private messenger handles
  belong to Contact Method — the boundary is explicit and enforced.
- Profile Verification (genuineness) is auditable and feeds Data Quality;
  verification state is owned by data-quality, not stored on the profile row
  (review decision 9).
- AI insights derived from social data are read-only; AI never edits the
  profile, and AI Suggestions require approval.
- Activity snapshots are point-in-time derived data, not user truth.

## Soft Delete Strategy

- Soft delete via deleted-at on Social Profile and its joins.
- Soft-deleting an owner soft-deletes its Social Profile joins in the same
  use-case transaction (no hard cascade).
- Deleted profiles are excluded from platform-account matching and outreach.

## Audit Fields

- created-by, updated-by, deleted-by on the entity and joins.
- created-at, updated-at, deleted-at.
- Verification history (actor, method, timestamp, outcome) — immutable, owned
  by data-quality.
- Owner join creation/removal and platform identity changes recorded in the
  Audit Log.

## Future Extension Notes

- Platform-specific schemas (LinkedIn vs. X) as derived views, not separate
  core rows.
- Activity/historical snapshots feeding engagement and company-intelligence
  signals.
- Audience and reach data as derived enrichment.
- Integration access (API tokens) in secured storage only, governed by
  SECURITY.md.

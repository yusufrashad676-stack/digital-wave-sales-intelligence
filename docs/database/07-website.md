# Database Design — 07 · Website

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Website" ·
DATABASE_RULES.md

## Purpose

The Website entity represents a web domain owned by or representing a Company
or Branch. It is an **independent digital-presence entity** — it is not a
Social Profile and never stored as one. The domain is a stable, near-unique
identity signal and a rich enrichment source.

## Responsibilities

- Identify a Company or Branch through its canonical domain.
- Be the target of Website Verification (does the domain resolve, does the
  organization truly own it) — state owned by the data-quality module.
- Be a source of enrichment data (title, description, technology signals).
- Provide a first-class matching signal for deduplication.

## Fields

- **Identity:** id (UUID).
- **Location:** canonical domain (required, normalized), url (optional).
- **Captured metadata:** title (optional), description (optional), technology
  hints (optional, derived).
- **Provenance:** import source reference.
- **Timestamps:** created at, updated at, deleted at.

**No ownership columns on this entity.** Ownership lives on the join tables
below (review decision 1).

## Relationships

Ownership is expressed exclusively through explicit join tables:

- **`CompanyWebsite`** — links a Website to a Company. Carries: primary flag,
  assigned-by, assigned-at.
- **`BranchWebsite`** — links a Website to a Branch (independent branch
  presence). Same metadata shape.
- Website → Verification (0 to many; existence/ownership checks, owned by the
  data-quality module).
- Website is **independent of Social Profile** — no ownership or nesting
  relationship between the two.

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Website : CompanyWebsite | 1 : 0..n | shared when two units resolve to one domain |
| Website : BranchWebsite | 1 : 0..n | independent branch domains |
| Company : CompanyWebsite | 1 : 0..n | e.g. country domains |
| Branch : BranchWebsite | 1 : 0..n | only independent branch domains |

## Constraints

- Canonical domain is required and normalized (lowercase, punycode for
  international domains).
- A Website row may exist unowned during import, but must be resolved through a
  join before it contributes to identity.
- Primary flag is unique per owner on the join (one primary domain per owner).
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **No database uniqueness on canonical domain (review decision 4).** DNS
  domains are globally unique in reality, but duplicate Website rows can
  legitimately arise during ingestion before resolution; the schema must not
  reject them. A repeated domain is a strong **Duplicate Candidate** signal
  that drives merge, not a constraint error.
- One canonical domain normalized form is stored; variations (www, scheme,
  path) are normalized away.
- A soft-deleted domain may be re-registered as a new Website row.

## Index Strategy

- Non-unique index on canonical domain (identity lookup and Duplicate Candidate
  matching).
- Index on the join tables at their owner columns (company id / branch id).
- Index on (owner, primary) for primary-domain queries.
- Index on title/description (with lowercased normalization) for free-text
  search.

## Validation Rules

- Domain: valid domain syntax, punycode normalization, no scheme/path embedded
  in the domain value.
- URL: full-URL syntax validated when stored; scheme normalized to https.
- No user-supplied HTML or scripts — all captured metadata is stored as data,
  never evaluated.
- Character and length bounds on title/description.

## Business Rules

- Website is independent from Social Profile: a domain is never a Social
  Profile and a network handle is never a Website.
- Website Verification (exists / not exists / ownership claimed) is auditable
  and feeds Data Quality; verification state is owned by data-quality, not
  stored on the Website row (review decision 9).
- The domain is a first-class Duplicate Candidate signal: two Companies sharing
  a domain surface as a strong candidate.
- AI never edits Website data directly; AI Suggestions require approval.
- Captured page metadata is derived enrichment, not user truth.

## Soft Delete Strategy

- Soft delete via deleted-at on Website and its joins.
- Soft-deleting an owner soft-deletes its Website joins in the same use-case
  transaction (no hard cascade).
- Deleted Websites are excluded from domain matching; a domain change is a new
  row, never an in-place rewrite of the canonical domain.

## Audit Fields

- created-by, updated-by, deleted-by on the entity and joins.
- created-at, updated-at, deleted-at.
- Verification history (actor, method, timestamp, outcome) — immutable, owned
  by data-quality.
- Owner join creation/removal and primary changes recorded in the Audit Log.

## Future Extension Notes

- Page-level crawling and indexing (Web pages as a child concept, not the
  Website row).
- Technology-stack detection and change monitoring.
- DNS records and SSL status as verification signals.
- Backlink and presence indicators feeding Company Data Quality.

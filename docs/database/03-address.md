# Database Design — 03 · Address

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Address" ·
DATABASE_RULES.md

## Purpose

The Address entity is a normalized, structured postal or geographic location.
It is stored once and reused so the same physical location is never duplicated
in separate rows, and so geo-search and verification operate on canonical
values.

## Responsibilities

- Represent a physical location in structured, queryable fields, including
  coordinates.
- Provide the object that Verification (address confirmed / not confirmed)
  targets.
- Support geo-based research at Company and Branch scope.

## Fields

- **Identity:** id (UUID).
- **Structure:** street line 1, street line 2 (optional), postal code, city,
  region/state (optional), country code (ISO 3166-1 alpha-2).
- **Geo:** latitude (optional), longitude (optional). Both or neither: a
  coordinate pair is stored only when both values are present and validated.
- **Formatted:** formatted representation (derived or captured, not a
  substitute for structure).
- **Provenance:** import source reference.
- **Timestamps:** created at, updated at, deleted at.

## Relationships

Ownership is expressed exclusively through explicit join tables (review
decision 1):

- **`CompanyAddress`** — links an Address to a Company. Carries address-role
  metadata (role, primary flag, assigned-by, assigned-at). The **registered
  office is represented through this join's metadata** (role = registered
  office; review decision 10).
- **`BranchAddress`** — links an Address to a Branch, with the same role and
  primary metadata.
- **Person address** is not modeled in v1; if needed later, a `PersonAddress`
  join mirrors the exact same pattern (deferred, see Future Notes).
- Address → Verification (0 to many; address-check records, owned by the
  data-quality module — not stored as fields on Address).

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Address : CompanyAddress | 1 : 0..n | shared when two units share a site |
| Address : BranchAddress | 1 : 0..n | shared when two units share a site |
| Company : CompanyAddress | 1 : 0..n | exactly one registered office |
| Branch : BranchAddress | 1 : 0..n | one current primary typical |
| Address : Verification | 1 : 0..n | auditable check history (data-quality) |

## Constraints

- Country code is required.
- At least one of postal code or city is required.
- Street/city/postal values are trimmed and normalized (address normalization
  rules) before persistence.
- Coordinates, when present, must fall in valid latitude/longitude ranges and
  agree with the country.
- On the joins: primary flag is unique per (owner, role) — one primary per role
  per owner.
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **No natural unique constraint.** Physical identity is the full normalized
  address tuple; exact-tuple equality is a Duplicate Candidate signal, not a
  schema key (two rows may legitimately vary in formatting detail). All
  duplicate resolution is the Duplicate Candidate's responsibility (review
  decision 4).
- Primary-flag uniqueness applies per owner + role at the join level.
- Reuse, not duplication: resolving a new input to an existing Address is
  preferred; the decision is made by data-quality, not by schema.

## Index Strategy

- Index on country code + postal code for the most common lookup path.
- Index on country code + city for city-scoped searches.
- **Spatial indexing (review decision 12):** latitude/longitude require a
  spatial index for radius/containment queries. Design intent: store
  coordinates as a PostGIS geography/geometry point with a GiST index, or as a
  geohash column with a btree prefix index. The concrete mechanism is decided
  at schema time; the requirement (indexed geo queryability) is fixed.
- Index on the join tables at their owner columns (company id / branch id) and
  on (owner, role, primary) for primary-address queries.

## Validation Rules

- Country code: ISO 3166-1 alpha-2, from the platform's country list.
- Postal code: format validated per country where a defined format exists.
- Coordinates: latitude in [-90, 90], longitude in [-180, 180]; both-or-neither.
- Free-text input is normalized into the structured fields before save;
  free-text is never stored as a substitute for structure.
- A private home address is stored only when it is the business address of the
  owner.

## Business Rules

- One physical location, one Address row; identical normalized tuples converge
  through Duplicate Candidate resolution, never through silent overwrite.
- Verification outcome (confirmed / not confirmed) is auditable and feeds Data
  Quality; verification state is owned by data-quality, not stored on Address.
  An unconfirmed address is demoted, not deleted.
- The registered office of a Company is a CompanyAddress join whose role is
  "registered office"; there is exactly one per Company.
- AI never edits Address fields; AI Suggestions for address changes require
  approval.
- Relocations preserve history: the old join is soft-deleted, the new one
  becomes primary, and the change is audited.

## Soft Delete Strategy

- Soft delete via deleted-at on Address and on the CompanyAddress / BranchAddress
  joins.
- Soft-deleting an owner soft-deletes its address joins in the same use-case
  transaction (no hard cascade).
- Deleted addresses are excluded from normalization lookup and geo search.

## Audit Fields

- created-by, updated-by, deleted-by on Address and on joins.
- created-at, updated-at, deleted-at.
- Verification history (actor, method, timestamp, outcome) — immutable, owned
  by data-quality.
- Role/primary changes on joins recorded in the Audit Log.

## Future Extension Notes

- Multi-locale address formats (addresses render differently per country) kept
  outside the core structure.
- Geocoding and reverse-geocoding enrichment as derived geo data.
- `PersonAddress` join when Person business locations are needed — same pattern
  as CompanyAddress / BranchAddress.
- Radius/containment queries via the spatial index once geo volume warrants.

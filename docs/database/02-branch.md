# Database Design — 02 · Branch

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Branch" ·
DATABASE_RULES.md

## Purpose

The Branch entity represents a distinct location, subsidiary-like unit, or
operating division of a Company, carrying its own contactable address and/or
contact details while remaining part of the parent. It is the location-level
research target.

## Responsibilities

- Model organizations that operate in many places or under multiple names.
- Own location-specific data: addresses, office contact channels, and optional
  independent digital presence.
- Give geo- and branch-scoped research a concrete unit to attach to.

## Fields

- **Identity:** id (UUID), company id, name.
- **Registration:** branch code (optional, e.g. legal branch number).
- **Flags:** headquarters flag (boolean, at most one per Company), active flag.
- **Status:** lifecycle status (active / inactive) — stable enumeration.
- **Provenance:** import source reference.
- **Timestamps:** created at, updated at, deleted at.

## Relationships

All ownership is expressed through explicit join tables — no polymorphic
owner-type columns:

- Branch → Company (many to one). A Branch belongs to exactly one Company.
- Branch → Address (1 to many, **via `BranchAddress`**; relocation history is
  preserved on the join).
- Branch → Contact Method (0 to many, **via `BranchContactMethod`**, office
  channels).
- Branch → Website (0 to many, **via `BranchWebsite`**, only when the branch
  has an independent presence).
- Branch → Social Profile (0 to many, **via `BranchSocialProfile`**, only when
  independently present).
- Branch → Employment (0 to many, people assigned to this location).

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Branch : Company | n : 1 | required; never orphaned |
| Branch : BranchAddress | 1 : 0..n | one current primary typical |
| Branch : BranchContactMethod | 1 : 0..n | office channels |
| Branch : BranchWebsite | 1 : 0..n | independent digital presence only |
| Branch : BranchSocialProfile | 1 : 0..n | independent presence only |
| Branch : Employment | 1 : 0..n | location assignment of a person |

## Constraints

- Company reference is required — a Branch never exists without its Company.
- Name is required.
- Headquarters flag, when true, is unique per Company (one headquarters at a
  time; enforced at the application/use-case level with index review at schema
  time).
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **No global natural unique key.** Branch identity is scoped to its parent.
- Branch code, when provided, is unique within its Company.
- Name-based uniqueness within a Company is a matching signal, not a hard
  constraint — two same-named units may legitimately exist in different
  countries. Duplicate resolution is the Duplicate Candidate's responsibility,
  not database uniqueness (review decision 4).
- Soft-deleted Branch records do not block re-creation of the same business
  unit.

## Index Strategy

- Index on company id (required for every child lookup).
- Index on (company id, name) for parent-scoped searches.
- Index on headquarters flag for HQ lookups.
- Index on active flag for filters.
- Indexes on the join tables at their owner columns (company id / branch id).
- Future: tenant/workspace column with its own index.

## Validation Rules

- Name: length bounds, trimmed, non-empty.
- Branch code: format per jurisdiction when applicable (e.g. national branch
  registry format).
- Country/jurisdiction values follow ISO 3166-1 alpha-2.
- A Branch must not duplicate the parent's registered address as a separate
  unlinked address — address reuse rules apply (see Address design).

## Business Rules

- A Branch cannot be created without a Company; reassignment to another Company
  is a reviewed, audited operation.
- At most one headquarters per Company at any time; promoting a Branch demotes
  the previous headquarters in the same transaction.
- Branch existence is verified (address/registration); verification results are
  auditable and feed Data Quality — verification state lives in the
  data-quality module, not on this entity.
- Relocations keep historical Address associations (soft-deleted old joins);
  addresses are never mutated in place to rewrite history.

## Soft Delete Strategy

- Soft delete via deleted-at. Default reads exclude deleted Branches.
- Soft-deleting a Company soft-deletes its Branches in the same use-case
  transaction (no hard cascade).
- Soft-deleting a Branch soft-deletes its joins (BranchAddress,
  BranchContactMethod, BranchWebsite, BranchSocialProfile) in the same
  transaction.
- Deleted Branch records are excluded from duplicate detection.

## Audit Fields

- created-by, updated-by, deleted-by.
- created-at, updated-at, deleted-at.
- Provenance of initial creation (Import Source / manual entry).
- Headquarters changes and Company reassignments recorded in the Audit Log.

## Future Extension Notes

- Geolocation and geohash for geo-search at branch level (coordinates live on
  the associated Address).
- Operating hours, public holidays, and timezone per location.
- Independent verification sweeps (address revalidation) attached to Branches.
- Branch-level data quality derived from its addresses and contact channels.

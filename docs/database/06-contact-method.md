# Database Design — 06 · Contact Method

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Contact Method" ·
DATABASE_RULES.md

## Purpose

The Contact Method entity is a typed, validated channel through which a Person
can be reached (business email, phone number) — and, in controlled cases, an
office-level channel for a Company or Branch. **A Contact Method is NOT a
person.** It is a value owned by a subject through an explicit join, never a
subject in its own right.

## Responsibilities

- Represent a reachable channel with a type and a normalized value.
- Be the value that Data Quality verification and confidence scoring target
  (state owned by data-quality, not duplicated here).
- Be the channel against which outreach operates (respecting suppression).

## Fields

- **Identity:** id (UUID).
- **Type:** reference to the **contact-method type lookup table** (email,
  phone, and extensible future types — review decision 6).
- **Value:** normalized value (lowercased email; E.164 phone), country code for
  phone (optional).
- **Provenance:** import source reference.
- **Timestamps:** created at, updated at, deleted at.

**No ownership columns on this entity.** Ownership, primary flags, and
suppression live on the join tables below (review decision 1).

## Relationships

Ownership is expressed exclusively through explicit join tables:

- **`PersonContactMethod`** — links a Contact Method to a Person (the canonical
  owner). Carries: primary flag, suppression state (suppressed-at, reason),
  assigned-by, assigned-at.
- **`CompanyContactMethod`** — links a Contact Method to a Company (office
  channel). Same metadata shape.
- **`BranchContactMethod`** — links a Contact Method to a Branch (office
  channel). Same metadata shape.
- Contact Method → Verification (0 to many; deliverability/validity checks,
  owned by the data-quality module).

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Person : PersonContactMethod | 1 : 1..n | a Person may own multiple methods, incl. several of one type |
| Company : CompanyContactMethod | 1 : 0..n | office channels |
| Branch : BranchContactMethod | 1 : 0..n | office channels |
| Contact Method : PersonContactMethod | 1 : 0..n | value may be linked to several subjects in controlled cases |

## Constraints

- Type reference is required and drawn from the type lookup table.
- Value is required and normalized per type.
- A Contact Method row is not required to have an owner at raw-import time, but
  must be resolved through a join before it contributes to identity.
- Primary flag is unique per (owner, type) on the join: one primary per owner
  per type.
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **No global uniqueness on values (review decision 3).** Emails and phone
  numbers are **not** database-unique. The same email appearing on multiple
  Contact Method rows is a legitimate, expected signal that feeds Duplicate
  Candidate generation; uniqueness constraints would break deduplication.
- Join-level uniqueness: a (subject, contact method, type) pairing appears
  once per join table (the same value re-assigned is a new join or a reviewed
  correction).
- Soft-deleted values do not block reuse of the same value later.

## Index Strategy

- Index on the join tables at their owner columns (person id / company id /
  branch id).
- Index on (join owner, type, primary) for primary-channel queries.
- Index on value (with type) for lookup and Duplicate Candidate matching — a
  non-unique index; matching is the dedupe engine's job.
- Index on suppression state for outreach exclusions.

## Validation Rules

- Email: syntax validation, lowercased, trimmed; disposable-domain and role-
  account checks as policy.
- Phone: E.164 normalization, country code validated against the region.
- Type-specific normalization is mandatory before save; un-normalized values
  are rejected.
- No free-form value that bypasses type validation.
- Type values come from the lookup table; ad-hoc types are rejected.

## Business Rules

- **Contact Method is never the subject of a Task or Activity** — the subject
  is the Person; the method is the channel.
- A Person can own multiple Contact Methods, including several of the same
  type; each is independently verified and scored by data-quality.
- Outreach honors suppression: suppressed joins are excluded from all automated
  outreach without exception.
- Verification (deliverable / not deliverable) is auditable and feeds
  confidence; verification and confidence state live in the data-quality
  module, not on the Contact Method row (review decision 9). A failed check
  demotes, never deletes, the method.
- AI never writes Contact Method values directly; AI Suggestions require
  approval.
- Confidence is derived and recomputable — never hand-edited.

## Soft Delete Strategy

- Soft delete via deleted-at on Contact Method and on its joins.
- Soft-deleting an owner soft-deletes its joins in the same use-case
  transaction (no hard cascade).
- A soft-deleted method is excluded from outreach and matching; a corrected
  value is a new record, not an in-place edit.

## Audit Fields

- created-by, updated-by, deleted-by on the entity and joins.
- created-at, updated-at, deleted-at.
- Verification history (actor, method, timestamp, outcome) — immutable, owned
  by data-quality.
- Suppression and re-enable events recorded in the Audit Log.

## Future Extension Notes

- Additional channel types added to the lookup table (SMS, messaging-app
  handles); note that messaging handles on public networks belong to Social
  Profile, not Contact Method.
- Contactability scoring (reach probability) derived from verification +
  freshness.
- Deliverability monitoring and bounce processing feeding verification.
- Suppression-list integration with the outreach/CRM pipeline.

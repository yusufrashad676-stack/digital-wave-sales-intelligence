# Database Design — 05 · Employment

**Status:** Design phase (Architecture Freeze v1.1 — post review)
**Companion docs:** MASTER_ARCHITECTURE.md §4, §10 · GLOSSARY "Person" ·
DATABASE_RULES.md

## Purpose

The Employment entity is the **only** link between a Person and a Company (and
optionally a Branch). It represents the fact that a person holds (or held) a
role at an organization, with its own tenure and status. It is a first-class,
verified, and historical record — not a loose relationship row.

## Responsibilities

- Express the Person → Company (→ Branch) relationship exclusively.
- Carry role, tenure, and current/historical status.
- Be the subject of employment Verification (is this person really there?).
- Preserve history: past roles are retained, never overwritten or hard-deleted.

## Fields

- **Identity:** id (UUID), person id, company id, branch id (optional).
- **Role:** title (free text), department (optional), role level (optional —
  referenced value drawn from a **lookup table**, per review decision 6).
- **Tenure:** started-on date, **left-on date (`leftAt`, nullable — null means
  the role is currently held)**.
- **Derived state:** current/former — **derived from `leftAt` (review decision
  5)**: `leftAt` is null ⇒ current; `leftAt` is set ⇒ former. No stored status
  or current flag.
- **Provenance:** import source reference.
- **Timestamps:** created at, updated at, deleted at.

## Relationships

- Employment → Person (many to one; required).
- Employment → Company (many to one; required).
- Employment → Branch (many to zero-or-one; optional location assignment).
- Employment → Verification (0 to many; auditable employment checks, owned by
  the data-quality module — not stored as fields here).
- Employment → Audit Log (every create/update/soft-delete).

## Cardinality

| Pair | Cardinality | Notes |
|------|-------------|-------|
| Employment : Person | n : 1 | required |
| Employment : Company | n : 1 | required |
| Employment : Branch | n : 0..1 | optional location |
| Person : Employment | 1 : 0..n | a person at many companies over time |
| Company : Employment | 1 : 0..n | current and historical |

## Constraints

- Person and Company references are required; a record without both is
  invalid.
- `leftAt`, when present, must be on or after the start date.
- Branch reference, when present, must belong to the same Company as the
  Employment's Company.
- Timestamps system-maintained; deleted-at null while active.

## Unique Rules

- **No uniqueness on (person, company).** A person may hold multiple roles at
  one Company over time (and simultaneously, e.g. employee + board member);
  all are legitimate history.
- Duplicate resolution is the Duplicate Candidate's responsibility, not
  database uniqueness (review decision 4). A candidate signal is (person,
  company, title, start date).
- Branch assignment uniqueness is not enforced; a person may be recorded at
  multiple branches over time.

## Index Strategy

- Index on (person id, left-at) — the hot path: current roles of a person
  (`leftAt` null sorts first).
- Index on company id (all people ever employed).
- Index on (company id, left-at) — current employees of a company.
- Index on branch id (people at a location).
- Index on (person id, company id) for matching and dedupe lookups.

## Validation Rules

- Title: length bounds, trimmed, non-empty.
- Role level: referenced from the role-level lookup table; free-text levels are
  not stored.
- Dates: sane ranges (no future start dates without review; left-at after
  start).
- No PII beyond what Employment legitimately requires (role, dates).

## Business Rules

- **Employment is the only permitted Person → Company link.** Domain enforces
  that no other path exists.
- **Current state is derived from `leftAt`** (review decision 5). It is never
  stored or user-editable; readers compute it (`leftAt` null = current).
- Employment verification (confirmed / not confirmed) is auditable and feeds
  Data Quality; verification state is owned by data-quality. An unverified
  employment is flagged, not deleted.
- A person can hold multiple Employment records; the platform must render
  current-versus-historical correctly, never assuming one.
- AI never writes Employment directly; AI Suggestions for employment changes
  require approval.

## Soft Delete Strategy

- Soft delete via deleted-at, used only for erroneous records (the audit trail
  retains the correction).
- Historical employment is never hard-deleted in normal operation — history is
  the product's value.
- Soft-deleting a Person soft-deletes their Employment records in the same
  use-case transaction (no hard cascade).

## Audit Fields

- created-by, updated-by, deleted-by.
- created-at, updated-at, deleted-at.
- Verification history (actor, method, timestamp, outcome) — immutable, owned
  by data-quality.
- Corrections recorded as soft-delete + new record, never in-place rewrite.

## Future Extension Notes

- Effective-dated changes (effective dating) for role/title corrections.
- Role standardization and seniority/level taxonomy (role-level lookup table
  grows here).
- Employment gap detection (unexplained breaks in a person's timeline).
- Historical timeline queries (a person's career, a company's hiring) as
  derived read models.

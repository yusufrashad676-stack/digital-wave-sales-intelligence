# ADR-006 — Contact Method Ownership

## 1. Status

**Accepted** (DATABASE DESIGN FREEZE v1.0)

## 2. Context

A Contact Method value (an email address, phone number, etc.) may be shared by many real
owners in the world, but within the platform a specific **owner–method pair** is the unit
of truth: a Person's email can be deliverable while the same address on another Person's
record is not. Verification evidence (08-verification-record.md) is scoped per
(owner, method) pair. The original design (06-contact-method.md) allowed a shared value
row with an N:M join to owners, which made per-owner verification granularity impossible.

## 3. Problem

If the value row is **shared** across owners, a verification recorded against the shared
row would describe all owners at once — one owner's confirmed email would appear confirmed
for everyone sharing it, which is factually wrong. If the row is **per-owner**, the N:M
join degrades to a redundant 1:1 link. Either way the earlier model conflicted with the
verification granularity requirement (blocking B3).

## 4. Decision

1. **A Contact Method is owned by exactly one owner** — a single owning entity (Person,
   Company, or Branch), modeled as a direct relationship, not a shared row plus join.
2. **Verification is performed per owner–method pair**, each pair carrying its own
   immutable Verification Record history and validity window (ADR/08).
3. **Duplicate detection lives in Data Quality**, not in shared ownership: the same
   address appearing under two owners is a Duplicate Candidate / reconciliation concern
   (07-duplicate-candidate.md), never a reason to share a row.
4. Value normalization and dedupe of the *string* (e.g., canonical email form) is an
   indexing/matching concern, not an ownership concern.

## 5. Alternatives Considered

- **Shared value row + N:M join** (earlier design) — rejected: destroys per-owner
  verification granularity and creates false "confirmed for everyone" semantics.
- **Shared value + verification at join level** — rejected: complicates the join into a
  first-class entity and still leaves the value row's identity ambiguous.
- **Fully denormalized (value embedded on owner)** — rejected: loses the ability to
  normalize/compare values across owners for dedupe and enrichment.
- **No dedupe awareness** — rejected: the same address under two owners is a real,
  platform-handled case via Duplicate Candidate.

## 6. Consequences

- 06-contact-method.md is revised to the direct ownership model; the N:M join is removed.
- Every owner–method pair is independently verifiable, independently expirable, and
  independently suppressible.
- Value-level dedupe across owners is the Data Quality module's responsibility, which
  keeps detection reviewable instead of silently shared.
- The same direct-ownership pattern applies to Social Profile claims (a profile is owned
  by exactly one owner; duplicate claims are candidates).

## 7. Trade-offs

- **Pro:** verification semantics are correct; simpler schema (no degenerate join);
  suppression and expiry are per-pair.
- **Con:** the same value may exist on multiple rows (one per owner) — accepted because
  value dedupe is a detection concern, and the value itself was never the unit of truth.

## 8. Future Revisions

- If a genuine shared-value case arises (e.g., a switchboard number with equal semantics
  for all owners), revisit with an explicit "shared value" flag — but each owner still
  needs a pair-level verification record.

---

Related: 06-contact-method.md, 08-verification-record.md, 07-duplicate-candidate.md;
blocking B3 in DATABASE_REVIEW.md.

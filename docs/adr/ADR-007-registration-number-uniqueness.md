# ADR-007 — Registration Number Uniqueness

## 1. Status

**Accepted** (DATABASE DESIGN FREEZE v1.0)

## 2. Context

Companies carry a registration number that is scoped by jurisdiction (decision 13:
unique within `(jurisdiction, registrationNumber)`). Raw imports routinely deliver the
same real-world company multiple times — under slight name variants, from different
sources, before any dedupe has run. A hard database uniqueness constraint on the
registration number would reject these legitimate pre-merge duplicate rows at the
ingestion door, which is exactly the case Duplicate Candidate (07) exists to absorb.

## 3. Problem

Enforcing uniqueness during ingestion contradicts the duplicate-handling flow: detection
must be allowed to *observe* duplicates before a reviewer *decides* the canonical record.
A database-level unique constraint (even a partial one, per ADR-005) would silently fail
valid imports and break the ingest → dedupe → review → resolve pipeline.

## 4. Decision

1. **Registration numbers are not enforced as unique during ingestion.** No unique
   constraint blocks the write path.
2. **DuplicateCandidate handles detection** of likely-same registrations (evidence,
   confidence, review).
3. **Resolution determines the canonical record**; the canonical record is what the
   platform subsequently reasons about.
4. **The database uniqueness strategy never blocks imports.** Uniqueness, where it exists,
   is expressed via the SQL partial-index mechanism (ADR-005) only on records that have
   been promoted to canonical status — never on the raw ingest path.

## 4a. Canonical Marker (chosen mechanism)

1. **Company carries an explicit `isCanonical` boolean column** (`is_canonical`, default
   `false`) in the foundation schema. It is the physical carrier of "this record is the
   canonical survivor".
2. **Only resolution (merge) sets `isCanonical = true`.** Ingestion always writes
   `is_canonical = false`; the transition to canonical happens exactly at the
   reviewed duplicate-resolution step, and that transition is the enforcement point for
   the constraint.
3. **The ADR-007 partial unique index targets the marker:**
   ```sql
   CREATE UNIQUE INDEX uq_companies_canonical_jurisdiction_registration_number
     ON companies (jurisdiction, registration_number)
     WHERE deleted_at IS NULL AND is_canonical = true;
   ```
   Because ingestion rows are never canonical, the index never rejects a legitimate
   pre-merge duplicate import; because resolution is the only writer of `is_canonical`,
   the canonical set is guaranteed at most one registration number per jurisdiction.
4. Registered as row #1 of the SQL Partial Index Registry in DATABASE_RULES.md.

## 5. Alternatives Considered

- **Unique `(jurisdiction, registrationNumber)` on the raw table** — rejected: rejects
  legitimate pre-merge duplicates at ingestion (the original B4 conflict).
- **Unique only on a canonical flag** — accepted as the chosen shape: the constraint
  applies to canonical records; the flag is set by resolution, so ingestion is never
  blocked.
- **Deferring uniqueness entirely (no constraint anywhere)** — rejected: resolution must
  be able to trust that once canonical, a registration number is held once per
  jurisdiction; otherwise merges can re-create collisions.
- **Upsert/merge-on-import** — rejected: silently merges without review, violating the
  "detection suggests, review decides" principle.

## 6. Consequences

- Ingestion is write-optimistic: duplicate-looking rows land and become candidates.
- A partial unique index exists on canonical records (ADR-005 mechanism); the ingestion
  path ignores it by writing rows as non-canonical first.
- Resolution (merge) is the only place a record transitions to canonical, and that
  transition is the enforcement point for the constraint.
- Data Quality reporting can flag "N canonical records share a registration number" as a
  violation signal — the constraint guarantees it should never be more than one.

## 7. Trade-offs

- **Pro:** ingestion never breaks on expected real-world duplication; the reviewable
  dedupe flow is preserved; uniqueness still holds exactly where it matters (canonical set).
- **Con:** uniqueness is a two-step guarantee (writes unconstrained, promotion constrained)
  and requires the promotion path to handle constraint-violation retries during resolution.

## 8. Future Revisions

- If resolution volume grows, consider a dedicated `canonicalKey` on the company that the
  partial index targets, keeping the ingestion table fully unconstrained.

---

Related: 01-company.md, 07-duplicate-candidate.md, ADR-005; blocking B4 in
DATABASE_REVIEW.md.

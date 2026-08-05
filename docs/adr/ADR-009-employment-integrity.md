# ADR-009 — Employment Integrity

## 1. Status

**Accepted** (DATABASE DESIGN FREEZE v1.0)

## 2. Context

Employment links a Person to a Company via a Branch (05-employment.md). The platform
invariant "Branch belongs to exactly one Organization" implies a cross-entity integrity
rule: **an Employment's Branch must belong to the Employment's Company**. A simple foreign
key from Employment to Branch, and from Employment to Company, cannot express that the
Branch actually belongs to that Company.

## 3. Problem

The integrity rule is real and must hold for all writes (creates and updates), but it is
a **conditional referential rule**, not a plain FK. The candidate structural solution — a
composite foreign key on `(companyId, branchId)` — is awkward in Prisma's relation model
and forces composite-key plumbing through every query.

## 4. Decision

1. **Employment integrity is enforced by the Domain/Application layer.**
2. **No composite foreign keys.** Employment uses plain single-column references
   (`companyId`, `branchId`), each a normal FK to its own table.
3. Enforcement points: the **Employment creation/update use-case** validates that the
   Branch belongs to the Company before persisting; the **Branch→Company re-parenting
   use-case** validates that no Employment would be orphaned, and blocks the move
   otherwise.
4. The rule is documented as a domain invariant (see 05-employment.md and DATABASE_RULES.md
   "What We Never Do") so every future mutation path runs the same validation.

## 5. Alternatives Considered

- **Composite FK `(companyId, branchId)`** — rejected: Prisma relation ergonomics degrade
  (composite relation targets); every join and include must carry both columns; the cost
  exceeds the benefit for a rule better expressed as a bounded write-path invariant.
- **Denormalized companyId on Branch** (single FK) — rejected: adds redundant state and a
  sync obligation between Branch.companyId and Employment.companyId.
- **Trigger-enforced check** — rejected: hidden application logic inside the database,
  harder to review and test than a domain use-case guard; rejected under the same
  reasoning as ADR-009's no-composite-FK stance.
- **No enforcement** — rejected: the invariant is load-bearing for reporting (a person's
  employer) and merge safety.

## 6. Consequences

- Employment writes are validated in the application layer; the two plain FKs keep the
  schema simple and Prisma-friendly.
- Branch re-parenting is a gated operation with an explicit orphan check.
- The invariant is documented and enforced at every mutation entry point, so there is one
  rule and multiple guarded gates — not multiple interpretations.

## 7. Trade-offs

- **Pro:** simple schema, idiomatic Prisma relations, single well-understood rule.
- **Con:** integrity depends on the application layer (correctness through code review and
  tests rather than a structural guarantee); a missed write path could violate the rule,
  so the domain test suite must cover it explicitly.

## 8. Future Revisions

- If a second application layer is introduced (e.g., a bulk data-import path that writes
  Employment directly), it must reuse the same validation or be rejected — the invariant
  does not weaken with new entry points.
- Revisit composite FKs only if a structural guarantee becomes a hard audit requirement.

---

Related: 05-employment.md, 02-branch.md, 04-person.md; blocking B7 in DATABASE_REVIEW.md.

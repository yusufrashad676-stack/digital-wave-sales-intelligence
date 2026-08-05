# 07 — Duplicate Candidate

Status: Draft v1.0 (Phase 4.2)
Design doc cross-referenced by: DATABASE_REVIEW.md B1/B4, MASTER_ARCHITECTURE.md §3 (Duplicate Detection → Verification), 04-person.md, 01-company.md

## 1. Purpose

A Duplicate Candidate represents a **suggestion that two existing records may be the same
real-world entity**. It is an explicit, reviewable, first-class record of a detection
result — never an automatic merge.

It exists because the platform must reconcile data from many sources without ever silently
losing information. Duplicate detection is advisory: it produces candidates, humans (or
authorized decisions) resolve them, and every suggestion is traceable, scored, and
time-bounded.

## 2. Responsibilities

- Record a proposed duplicate pair (entity A ↔ entity B) for a given entity type.
- Capture the confidence score and the evidence supporting the suggestion.
- Track the reviewer decision (`confirmed`, `rejected`) and its actor.
- Expire unresolved suggestions so stale candidates cannot linger indefinitely.
- Record the outcome reference when a confirmed pair is later resolved elsewhere, without
  itself performing the resolution.

## 3. Lifecycle

```
open → decided (confirmed / rejected) → closed
  ↘ expired (auto-closed unresolved)
```

- **open**: suggested, awaiting review.
- **confirmed**: reviewer agrees the pair is a duplicate; resolution happens in a separate
  mechanism (never here).
- **rejected**: reviewer disagrees; the pair stays separate.
- **expired**: auto-closed after the expiration window without a decision.

A confirmed candidate does not merge anything; it authorizes and documents a resolution
that occurs elsewhere and is recorded as the candidate's outcome.

## 4. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| entityType | code | What kind of record the pair refers to (e.g., person, company). |
| entityAId | identifier | First record of the pair. |
| entityBId | identifier | Second record of the pair. |
| suggestedBy | enum | How the candidate arose: `automation`, `ai`, `manual`. |
| confidenceScore | metric | 0–1 score of the match strength. |
| evidence | structure | Field-level evidence: which attributes matched, match strength, algorithm/version references. |
| status | state | `open`, `confirmed`, `rejected`, `expired` (see Lifecycle). |
| decidedBy | reference | User or automation actor that made the decision (null while open). |
| decidedAt | timestamp | Decision time (null while open). |
| decisionNote | text | Optional reviewer rationale. |
| outcome | reference | When resolved: link to the resolution record performed elsewhere. |
| expiresAt | timestamp | When an unresolved candidate auto-closes. |
| createdAt / createdBy | audit | Who/what suggested this candidate and when. |

## 5. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Duplicate Candidate → record A/B | n : 1 (each side) | Weak references to the entity pair; candidate may outlive neither side's active state but keeps ids. |
| Duplicate Candidate → Reviewer (User) | n : 1 | The deciding actor, when decided. |
| Duplicate Candidate → Data Quality evidence | 1 : n | Verification/confidence records may cite the candidate. |
| Duplicate Candidate → Resolution record | n : 1 | The merge/resolution performed elsewhere, when confirmed. |

## 6. Validation Rules

- entityType is required and must reference a valid entity registry.
- entityAId and entityBId are required and must differ (no self-pairs).
- confidenceScore must be within 0–1 and non-negative.
- evidence is required (a candidate without evidence is not admissible).
- Only `open` candidates can be decided; decided/expired candidates are immutable.
- `confirmed` is only valid while both referenced records still exist in active state.
- expiration is policy-driven (bounded window from creation).

## 7. Ownership

The **Data Quality function** owns duplicate candidates: detection produces them,
data-quality policy governs their thresholds and expiry, and the **reviewer** (User or
authorized automation) owns the decision. Detection logic never decides; it only suggests.

## 8. State Machine

```
open → confirmed (→ resolution elsewhere)
     → rejected
     → expired (auto, when expiresAt passes while open)
```

- `open` is the only actionable state.
- `confirmed` transitions to a resolution action in the separate resolution mechanism; the
  candidate records the outcome reference once done.
- `rejected` is final; a rejected pair may produce a *new* candidate later only if new
  evidence appears (a distinct candidate record).
- `expired` is terminal and auto-generated; it never silently resolves anything.

## 9. Failure Handling

- A candidate whose pair can no longer be resolved (one side deleted/merged already) is
  closed as `expired` or `rejected` with a note; it never auto-confirms.
- Detection processing errors produce no candidate; the failed detection run is a
  processing-record failure (see 05-raw-import.md §8), never a false candidate.
- Decision conflict (two reviewers decide differently) resolves by record: the later
  decision wins only if the candidate is still `open`; otherwise the conflict is a new
  candidate for review.

## 10. Retry Strategy

- Detection itself may be re-run when new evidence arrives; it produces **new** candidates
  and does not reopen decided ones.
- Expired candidates are not auto-resurrected; re-detection may create a fresh candidate
  with fresh evidence and a fresh expiry.
- No retry mutates an existing candidate's evidence or score.

## 11. Data Retention

- Candidates are retained as audit/provenance evidence of the dedupe process: who was
  suggested as a duplicate, on what evidence, and how it was resolved.
- Expired/rejected candidates are archived under policy, not silently deleted; they explain
  why two records remain separate.
- Retention is governed by data-governance policy; the decision trail outlives the
  candidate's actionable life.

## 12. AI Interaction

- AI may **suggest** duplicates by producing candidates with its confidence score and
  evidence — it never confirms or rejects them, and never merges.
- AI suggestions are marked `suggestedBy = ai` and are distinguishable from deterministic
  automation in review workflows.
- AI that has reviewed a candidate may attach an insight note, but the decision remains
  human/authorized.

## 13. Workflow Interaction

- Candidate creation is a domain event; workflows route open candidates to review queues
  and notify reviewers.
- A `confirmed` decision triggers the resolution workflow (which performs the merge
  elsewhere and records the outcome on the candidate).
- Expiry events feed metrics ("candidates waiting too long") to reviewers and policy
  owners.

## 14. Security

- Candidate review is permissioned; only authorized reviewers see pairs and evidence.
- Confirmation is a significant action and is audited (who confirmed, on what evidence).
- AI-suggested candidates must be visibly labelled in review surfaces; no silent
  auto-confirmation path exists.
- The candidate never holds raw payloads — evidence references source imports and fields
  only.

## 15. Index Strategy

- `(entityType, status)`: open review queues per record kind.
- `entityAId` / `entityBId`: all candidates touching a record.
- `expiresAt`: automated expiration sweep.
- `confidenceScore` (+ status): prioritization of review queues.
- `createdAt`: fresh- vs stale-candidate triage.

## 16. Future Scalability

- Detection volume can be high; candidates are cheap, reviewable facts decoupled from the
  (rare) resolution action.
- Scoring algorithms and versions are recorded as evidence references, so future
  algorithm changes never invalidate past decisions.
- Per-entity-type thresholds are policy, not schema; new record types reuse the candidate
  structure unchanged.
- A global "dedupe workbench" is just a view over `(entityType, status)` — no new entity
  needed.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Duplicate Candidate.
- Resolves the B4 tension framing: uniqueness is enforced by **decision**, not by
  rejecting an import at the door (see 01-company.md decision 4 / 13 interplay).
- Implements MASTER_ARCHITECTURE.md §3: detection suggests, review decides, resolution
  executes elsewhere.

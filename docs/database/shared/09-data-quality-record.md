# 09 — Data Quality Record

Status: Draft v1.0 (Phase 4.3)
Design doc cross-referenced by: DATABASE_REVIEW.md B1/R5/R7, MASTER_ARCHITECTURE.md §3 (Data Quality stage), 08-verification-record.md, 07-duplicate-candidate.md, 03-import-source.md

## 1. Purpose

A Data Quality Record is the **explainable, versioned score** of how trustworthy a subject
is, derived exclusively from evidence. It is the platform's quality judgement layer: never
a hand-set number, never a field on the subject, always recomputable and always
traceable to its inputs.

It exists because "is this data good enough to act on?" must be answerable with a
reproducible, auditable rationale — not an opinion stored on a row.

## 2. Responsibilities

- Score a subject (entity, contact-method pair, duplicate pair) on defined quality
  dimensions (confidence, completeness, recency, provenance).
- Derive scores **only** from evidence: verification records, source reliability,
  completeness, and candidate decisions.
- Explain every score: the contributing factors, their weights, and their individual
  contributions.
- Record historical snapshots; scores are appended over time, never overwritten.
- Support recalculation as a first-class, versioned operation.
- **Never edit the source entity** — a quality record observes; it does not mutate.

## 3. Lifecycle

```
computed (snapshot, version N) → valid (until superseded) → superseded (by N+1)
                                                          → archived (history)
```

- **computed**: a score snapshot exists with its evidence inputs and version.
- **valid**: the latest snapshot is the operative judgement for its subject.
- **superseded**: a recalculation produced a newer snapshot; the old one remains as history.
- **archived**: old snapshots move to archival under retention policy.

Recalculation never edits prior snapshots; it emits a new version. "Current score" is
always "latest computed snapshot", which is derived, never stored as a single mutable value.

## 4. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| subjectType | code | Subject kind (entity, contact-method pair, duplicate pair). |
| subjectId | identifier | The subject's id. |
| scoreType | code | Dimension scored (confidence, completeness, recency, overall). |
| score | metric | Normalized 0–1 value. |
| breakdown | structure | Contributing factors: each with its score, weight, and contribution (the explanation). |
| evidenceRefs | references | The exact evidence inputs used (verification records, source reliability, completeness metrics, decisions). |
| version | counter | Monotonic snapshot version for this subject+scoreType. |
| computedAt | timestamp | When the snapshot was produced. |
| computedBy | reference | The Automation Job / system version that produced it (algorithm reference). |
| validFrom / validUntil | timestamps | Snapshot validity; superseded before validUntil is possible on recalculation. |
| recalculationMeta | structure | Trigger, scope, and inputs of the recompute run. |

## 5. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Data Quality Record → subject | n : 1 | Weak reference by (subjectType, subjectId); scores outlive subject state changes. |
| Data Quality Record → Verification Record | n : m | Verification evidence is the primary input. |
| Data Quality Record → Import Source (reliability) | n : 1 | Source trust posture feeds provenance scoring. |
| Data Quality Record → Duplicate Candidate | n : 1 | Pair confidence scores derive from candidate evidence/decisions. |
| Data Quality Record → Automation Job | n : 1 | The recalculation that produced this snapshot. |

## 6. Validation Rules

- subjectType, subjectId, scoreType, score, and version are required.
- score must be within 0–1.
- breakdown must account for the score: the aggregate is reproducible from its factors.
- evidenceRefs must reference real evidence records (no evidence, no score).
- version increments monotonically per (subject, scoreType).
- A snapshot is immutable once computed.

## 7. Ownership

The **Data Quality function** owns scoring policy (dimensions, weights, thresholds). The
platform (via Automation Job or the score engine) owns computation. No user or workflow
sets a score directly — that would violate the "derived from evidence" invariant.

## 8. State Machine

```
computed → valid → superseded (by a newer snapshot for the same subject+type)
```

The record itself is single-shot and immutable. "valid vs superseded" is **derived** by
comparing version/validUntil across snapshots of the same (subject, scoreType). There is
no mutating transition; lifecycle is governed by recalculation emitting newer versions.

## 9. Retry / Recovery Strategy

- A failed recalculation produces no snapshot; it logs a failure and may retry with a fresh
  run.
- Recalculation is idempotent per (subject, scoreType, evidence-set): the same inputs must
  yield the same score, so re-runs never fork history.
- If evidence is found inconsistent (a verification record was corrected-by-new-record),
  recalculation emits a new snapshot reflecting the corrected evidence set — it never
  rewrites the old snapshot.

## 10. Security

- Scores and breakdowns are internal operational data; access is role-restricted.
- Evidence references keep the score tamper-evident: a score claims "based on these
  records", and those records are immutable.
- Raw evidence (e.g., verification value snapshots) is not copied into this record; only
  references, minimizing PII duplication (per P7).
- Recalculation scope/triggers are audited; a bulk re-score is a visible event.

## 11. Audit Requirements

- Every snapshot is tied to its computation (Automation Job/version) in the Audit Log —
  "this score was computed by job X at time T with inputs Y".
- Recalculation runs, their scope, and their rationale are audited.
- Score policy changes (weights, thresholds, dimensions) are audited and versioned.

## 12. AI Interaction

- AI never writes or edits scores or weights.
- AI may *suggest* score-policy changes or flag surprising scores ("this confident entity
  has conflicting evidence") as insight events.
- AI insights must cite the Data Quality snapshots they rely on, keeping the reasoning
  chain reproducible.

## 13. Workflow Interaction

- Scores are a primary workflow decision input: promotion gates, re-verification triggers,
  alerting ("score dropped below threshold").
- Workflows never set scores; they consume them.
- Score events (recalculated, threshold crossed) feed domain events for downstream actions.

## 14. Scalability

- Snapshots accumulate deliberately; hot reads target the latest version, historical
  snapshots are archival candidates.
- Version-per-(subject, type) keeps recompute bounded: recalculation only emits a new
  snapshot, never a full rewrite.
- Batch backfill (R7) is a large recalculation run; it is serialized as a versioned
  operation with its own audit trail.

## 15. Index Strategy

- `(subjectType, subjectId, scoreType)` + version: latest-version derivation.
- `(scoreType, score)`: quality-tier filtering and reporting.
- `computedAt`: recompute cadence and drift analysis.
- `(subjectType, subjectId)` for contact-method-pair scores specifically.
- Threshold-crossing queries over current scores for workflow alerts.

## 16. Future Extensions

- New score dimensions (freshness, enrichment-readiness) are lookup additions, not schema
  changes.
- ML-assisted scoring can replace factor weights over time; each model/version is recorded
  in computedBy, keeping history comparable.
- Time-series views of a subject's score trajectory are derivable from snapshots without
  new entities.
- Cross-subject quality summaries (e.g., per-source average quality) are aggregations over
  snapshots.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Verification/Confidence/Data Quality Score.
- Implements R5/R7: explainable scoring, historical snapshots, event-driven + batch
  recalculation policy.
- Strictly observes the invariant "never edits source entities" — observation-only design.
- Depends on 08-verification-record.md for its primary evidence input.

# 02 — Audit Log

Status: Draft v1.0 (Phase 4.1)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, MASTER_ARCHITECTURE.md §8 (Event Model), SECURITY.md

## 1. Purpose

The Audit Log is the platform's append-only record of everything that happened, by whom,
against which entity, when, and with what before/after state. It is the source of
accountability for human and automated actions, and the tamper-evident trail required by
the platform's invariants ("Verification always auditable", "AI never edits data directly").

It is **not** a business table: no business process reads it for operational decisions;
it exists for review, compliance, forensics, and traceability.

## 2. Responsibilities

- Record every mutating action across the platform in event order.
- Attribute the action to a durable actor (human User, automation job, system).
- Capture the affected entity (type + id) and the structural before/after state.
- Provide a stable query surface for compliance review and troubleshooting.
- Enforce retention: no in-place edits, only append; archival under policy.

## 3. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| occurredAt | timestamp | When the action occurred (source of truth, not insert time). |
| actorType | enum | `user`, `automation`, `system`. |
| actorId | identifier | Durable actor identity (frozen; survives later changes/deletion). |
| actorLabel | text | Snapshot of display context (e.g., name, job name) for readability. |
| actionCode | code | Registry-controlled action identifier (e.g., create, update, verify, disable). |
| entityType | code | Registry-controlled entity type targeted by the action. |
| entityId | identifier | The affected entity's id. |
| workspaceScope | reference | Optional future tenant scope of the action. |
| before | structure | Structural prior state (field-level snapshot). |
| after | structure | Structural resulting state. |
| requestId | identifier | Correlation id tying the action to its originating request/execution. |
| outcome | state | `success`, `failure`, `rejected`. |
| reason | text | Optional human/automation rationale. |

## 4. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Audit Log → User (actor) | n : 1 | Weak reference: must survive User deletion. Not a hard FK to the live account. |
| Audit Log → Automation Job (actor) | n : 1 | Weak reference to the executing job, when applicable. |
| Audit Log → Business entities | n : 1 | Weak reference by (entityType, entityId); no foreign-key enforcement because audit must outlive the entity. |
| Audit Log → Domain Event | 1 : 1 | Every domain event that mutates state carries its audit entry (or references it). |

## 5. Lifecycle

```
append → retained → archived (never modified, never deleted in place)
```

- Append: written once, at action completion, with the authoritative outcome.
- Retained: queryable during the retention window.
- Archived: moved to cold storage per retention policy; still recoverable for compliance.

There is **no delete and no update** in the operational lifecycle. Corrections are recorded
as new corrective entries, not edits.

## 6. Validation Rules

- `occurredAt` must be the authoritative action time and is immutable.
- An actor is always present; the `system` type is reserved for platform-internal actions.
- `actionCode` and `entityType` must come from their registries; unknown codes are rejected.
- before/after must be structurally consistent for the entity type.
- outcome is required; a `failure`/`rejected` entry may omit after-state.
- An entry may not be created, modified, or removed by any business workflow.

## 7. Soft Delete Strategy

**None.** The Audit Log is append-only and never soft-deleted. Historical integrity is
preserved by retention + archival, not by deletion. Any deletion capability, even
administrative, is out of scope for the operational design and is addressed only in
compliance workflows under explicit policy.

## 8. Audit Requirements

The Audit Log audits itself indirectly:

- Log integrity (append-only, no gaps, no rewrites) is itself a monitored property.
- Tamper-evidence: the sequence of entries supports integrity verification; any anomaly
  is reportable.
- Administrative read access is itself reviewed; privileged reads are logged.

## 9. Index Strategy

- `(entityType, entityId)`: trace a single entity's history.
- `actorId` (+ time): what one actor did.
- `occurredAt`: retention windowing and time-range review.
- `actionCode`: filtering specific action types.
- `requestId`: reconstruct an end-to-end request/execution.
- Future: time-partitioned organization to keep hot queries small.

## 10. Future Scalability

- The Audit Log is the highest-volume structure; design assumes append-heavy writes with
  bounded query windows.
- Retention/archival must be policy-driven and autonomous (no per-row human decisions).
- Partitioning by time keeps archival and windowed queries efficient.
- Immutable, event-sourced reads (replay) are possible from the sequence without changing
  the operational schema.

## 11. AI Interaction

- AI never writes, edits, or deletes audit entries.
- When AI performs or proposes an action, the entry is written by the enforcement layer
  with `actorType = automation` and the AI invocation context (model/version/reasoning
  reference) attached, keeping the human-readable rationale in `reason`.
- Audit is the mechanism that proves the invariant "AI never edits data directly": any
  AI-sourced change is visible, attributable, and reviewable.

## 12. Workflow Interaction

- Every workflow execution that mutates state produces audit entries attributed to the
  automation job.
- Workflows may **read** audit output (e.g., "find when this field last changed") but never
  write to it.
- Correlation via `requestId` lets compliance trace a single workflow run across every
  entity it touched.

## 13. Security Considerations

- Append-only enforcement is a hard platform constraint, not a convention.
- PII in before/after snapshots must be minimized and governed by retention limits; the
  log is not a general-purpose data store.
- Read access is restricted to authorized roles; privileged reads are themselves logged.
- Integrity verification is supported so tampering is detectable after the fact.
- Export/archival paths must respect the same access control as the live log.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Audit Log.
- Satisfies GLOSSARY.md invariants: "Verification always auditable" and "AI never edits
  data directly".
- Aligns with MASTER_ARCHITECTURE.md §8 Event Model (mutating domain events carry audit).

# 10 — Workflow

Status: Draft v1.0 (Phase 4.3)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, MASTER_ARCHITECTURE.md §3/§8 (Automation, Event Model), GLOSSARY.md, 11-automation-job.md

## 1. Purpose

A Workflow is the **definition of automated behavior**: what happens when a trigger fires,
expressed as a versioned graph of actions. It is declarative and passive — it *describes*
what to do; it never *does* anything. Execution is the sole responsibility of Automation
Job (11).

This separation (definition vs execution) is what makes automation safe: definitions are
reviewable and versioned, executions are auditable and cancellable.

## 2. Responsibilities

- Describe a reusable automation as a versioned node graph (what actions run, in what
  order, with what branches).
- Declare the triggers that may start it (domain events, schedules, manual invocation).
- Declare the input contract each run expects.
- Provide a stable identity that survives edits (edits produce new versions, not new
  workflows).
- Hold governance state: draft → published → deprecated, with ownership.

## 3. Lifecycle

```
draft → published → deprecated (retired from new triggers)
  ↘ archived (historical)
```

- **draft**: being composed; not runnable.
- **published**: current version may be triggered. Exactly one version is *active* at a time.
- **deprecated**: no longer eligible for new triggers; already-started executions finish.
- **archived**: retained for audit; never triggers again.

Edits to a published workflow create a new version; they never mutate a published graph
in place.

## 4. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| name | text | Human-readable name. |
| description | text | Intent and governance rationale. |
| status | state | `draft`, `published`, `deprecated`, `archived`. |
| owner | reference | The User accountable for this workflow. |
| triggerPolicy | structure | Trigger declarations: event subscriptions, schedules, manual entry points, conditions. |
| inputContract | structure | Declared inputs each run requires (structure + validation bounds). |
| graph | structure | Versioned node graph: nodes (action types + parameters) and edges (flow/branches/join conditions). |
| versions | references | The published version lineage (child records, immutable once published). |
| createdBy / createdAt | audit | Author and creation time. |
| updatedAt | timestamp | Last mutation (version increments). |
| deletedAt | timestamp | Soft-delete marker. |

## 5. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Workflow → Workflow Version | 1 : n | Definition lineage; published versions are immutable. |
| Workflow Version → node/action catalog | n : m | Nodes reference an extensible action vocabulary. |
| Workflow → Trigger source | n : m | Which events/schedules may start it (event model §8). |
| Workflow → Automation Job | 1 : n | Executions of this definition. |
| Workflow → Owner (User) | n : 1 | Accountability. |
| Workflow → Domain Event (published) | n : m | The events it subscribes to. |

## 6. Validation Rules

- name is required; a workflow must be `draft` before any version can be `published`.
- A published version's graph must be structurally valid: known action types, connected
  nodes, bounded loop/branch depth.
- A published version must declare at least one trigger.
- inputContract must be satisfied by every trigger that fires it.
- A workflow cannot be `archived` while versions are still `published` or executions are
  running.
- Only one version is `active` at a time.

## 7. Ownership

The **owner (User)** is accountable for the workflow's behavior and its triggers. The
**platform governance** function approves publishing. Nodes/actions are provided by the
platform's action catalog; users assemble, never implement.

## 8. State Machine

Workflow-level:

```
draft → published → deprecated → archived
```

Version-level (within a workflow):

```
draft → published (immutable) → (superseded by newer published version)
```

- `draft` is the only editable state.
- `published` is immutable; corrections are a new draft version.
- `deprecated`/`archived` stop new triggers; in-flight executions are owned by Automation
  Job, not the workflow.

## 9. Retry / Recovery Strategy

- Workflow definitions do not execute, so they have no retry of their own; execution
  retry is owned by Automation Job (11 §9).
- A failed publish is transactional: either the version is fully published or the workflow
  stays `draft`.
- Version publishing is idempotent by (workflow, version number): the same version cannot
  be published twice.

## 10. Security

- Publishing is a gated, privileged action (audited): automation that mutates data must
  pass governance review.
- Only owners and authorized roles may view/modify a workflow; drafts are never visible to
  executors.
- Triggers are validated at publish: a workflow may only subscribe to events and actions it
  is permitted to use.
- Deprecated/archived workflows cannot be re-triggered; reactivation is a new publish.

## 11. Audit Requirements

- Draft creation, publish, deprecate, archive, and ownership changes are audited.
- Each publish records the version, the graph fingerprint, and the approving actor.
- Version history is immutable: what ran (which version) is always identifiable from the
  Automation Job.

## 12. AI Interaction

- AI never publishes, edits, or executes workflows.
- AI may *propose* workflow drafts ("suggested automation: when a company is enriched,
  create a task for the owner") which a human reviews and publishes.
- AI proposals are clearly marked as suggestions; they cannot be triggered until a human
  publishes them.

## 13. Workflow Interaction

- This entity is the definition side of the automation seam: workflows **subscribe** to
  domain events and **are executed** by Automation Job.
- Workflows may also emit new events (composed behavior) that trigger other workflows —
  the graph supports orchestration without hard-coding execution.

## 14. Scalability

- Definitions are cheap and rarely mutated; versions give unbounded lineage without
  growth in the active set.
- The action catalog is extensible via lookup; new capabilities need no schema change.
- Many workflows can subscribe to the same event; the event model (not the workflow) is
  the fan-out point.

## 15. Index Strategy

- `status`: governance dashboard (draft/published/deprecated).
- `owner`: who is accountable for what.
- Trigger subscriptions by event: dispatch lookup when an event fires.
- Version lineage by workflow: identify the active version.

## 16. Future Extensions

- Visual workflow builders map to the graph structure without schema change.
- Multi-step human-approval nodes (a task inside a workflow) extend the node catalog.
- Workflow templates/recipes for common patterns (dedupe review, re-verification) are
  seeded definitions.
- Per-workspace workflow sets (scoping) are a future additive scope, consistent with the
  B5 matrix.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Workflow.
- Implements the trigger/node-graph requirements; versions guarantee immutable, auditable
  behavior over time.
- Defers execution concerns entirely to 11-automation-job.md (definition/execution split).
- Aligns with MASTER_ARCHITECTURE.md §8 Event Model as the fan-out seam.

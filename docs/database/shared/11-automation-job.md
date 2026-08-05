# 11 — Automation Job

Status: Draft v1.0 (Phase 4.3)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, MASTER_ARCHITECTURE.md §3/§8 (Automation, Event Model), 02-audit-log.md (actor type `automation`), 10-workflow.md, 05-raw-import.md, 06-search-execution.md

## 1. Purpose

An Automation Job is the **execution of a Workflow version**: the concrete, cancellable,
retryable, measured, logged, and idempotent run of the definition. Everything a workflow
*does* happens inside an Automation Job, and everything an Automation Job does is
attributable, observable, and replay-safe.

It is the automation counterpart of Search Execution (06): definitions are passive, jobs
are active and time-boxed.

## 2. Responsibilities

- Execute a specific, immutable Workflow Version against a frozen input context.
- Enforce retry bounds, timeout, and cancellation for the run.
- Collect run metrics (duration, nodes executed, records processed, outcomes).
- Produce structured execution logs (trace of what happened at each node).
- Guarantee idempotency: a trigger cannot silently spawn duplicate side effects.
- Attribute itself in the Audit Log as the `automation` actor for every side effect.

## 3. Lifecycle

```
created → running → completed
                ↘ failed (bounded retry) → completed / terminal-failed
                ↘ cancelled (terminal)
```

A job is **one attempt**. Retrying a failed workflow is either node-level (within this job)
or a new job (see §9). One job executes one workflow version.

## 4. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| workflow | reference | The workflow definition executed. |
| workflowVersion | reference | The exact immutable version executed (never "latest" at run time). |
| trigger | structure | What fired it: event id, schedule, manual invocation. |
| inputContext | structure | Frozen snapshot of the run's inputs (per the input contract). |
| status | state | `created`, `running`, `completed`, `failed`, `cancelled` (see State Machine). |
| attempt | counter | 1-based; node-level retries do not increment, new jobs do. |
| idempotencyKey | identifier | (workflow, source event) derived key preventing duplicate execution. |
| timeoutPolicy | structure | Time budget and expiry behavior. |
| cancellation | structure | Who cancelled, when, at which boundary. |
| metrics | structure | Duration, nodes executed, records processed, side-effect counts, errors. |
| logs | references | Structured log records for each node execution (retained per policy). |
| outputSummary | structure | Rollup of what the run produced (e.g., tasks created, imports triggered). |
| correlationId | identifier | End-to-end correlation with audit entries and side effects. |

## 5. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Automation Job → Workflow | n : 1 | Definition. |
| Automation Job → Workflow Version | n : 1 | Immutable version executed. |
| Automation Job → Trigger event | n : 1 | The domain event that fired it. |
| Automation Job → Audit Log (as actor) | 1 : n | Every side effect of the run is audited with this job as actor. |
| Automation Job → Side effects | 1 : n | Raw Imports, Search Executions, Tasks, Verifications it initiated. |
| Automation Job → Log records | 1 : n | Structured node logs. |

## 6. Validation Rules

- workflow, workflowVersion, trigger, and idempotencyKey are required.
- idempotencyKey is unique: the same (workflow, source event) must not execute twice.
- workflowVersion must be a `published` version at start.
- inputContext must satisfy the workflow's input contract.
- status transitions follow the State Machine; a finished job cannot return to `running`.
- A cancelled/failed job that already emitted side effects is marked and reported; it is
  never silently treated as a clean run.

## 7. Ownership

The **workflow owner (User)** is accountable for the job's behavior. The **triggering
context** (event/schedule/manual actor) is recorded per run. The platform provides the
execution engine; humans own intent.

## 8. State Machine

```
created → running → completed
                ↘ failed → (retry? → running [new job, attempt+1]) → completed
                          ↘ terminal-failed (retry budget exhausted)
                ↘ cancelled (terminal)
```

- `created`/`running`: transitional.
- `completed`: all nodes finished within policy; side effects done.
- `failed`: an error occurred; retryable within the job's retry budget.
- `cancelled`: authorized cancellation at a safe boundary; partial side effects are
  reported, never hidden.

## 9. Retry / Recovery Strategy

- **Node-level retry**: a transiently failing node retries within the job (bounded,
  with backoff) without changing the job identity.
- **Job-level retry**: a failed job may spawn a new job (attempt +1) **only if** the
  execution is idempotency-safe — the idempotencyKey is only released for re-execution
  when the prior attempt did not complete side effects.
- A `completed` job's idempotencyKey is consumed; it can never re-run.
- Timeouts halt at a safe boundary; recovery resumes with a fresh job, never by resuming a
  cancelled one.

## 10. Security

- Side effects of automation are **visible and attributable**: no automation path can act
  anonymously (Audit Log actor = this job).
- Privileged actions (merges, deletions, role-adjacent changes) require the workflow to be
  authorized for them at publish time; the job inherits that authority, never exceeds it.
- Cancellation is gated and audited.
- Logs may contain operational detail; access is role-restricted.
- Idempotency enforcement prevents double side effects, which is a correctness *and*
  safety property.

## 11. Audit Requirements

- Job lifecycle (create, start, complete, fail, cancel) is audited.
- Every side effect the job causes is audited with `actorType = automation` and this job's
  id — the full causal chain is reconstructable via correlationId.
- Retry and cancellation decisions are audited (who/what decided, when, why).
- Logs are retained under policy and are cross-referenceable from audit entries.

## 12. AI Interaction

- AI never creates, retries, or cancels jobs.
- An AI-driven step inside a workflow (if the workflow includes an AI action node) runs
  *inside* the job with the job's identity and full auditability — the AI is a node, not
  an actor.
- AI may propose workflows (10 §12); humans publish them; jobs execute them.

## 13. Workflow Interaction

- Jobs are the execution layer of the workflow system: workflow → version → job → nodes.
- Jobs emit domain events (completed/failed) that can trigger further workflows — forming
  composed automation while keeping every hop attributable.
- A job can initiate Search Executions, Raw Import processing, Verifications, or Tasks —
  always recorded as its side effects.

## 14. Scalability

- Jobs are the schedulable, distributable unit: any worker can execute any job because the
  inputContext is frozen and the workflow version is immutable.
- Idempotency and frozen context make distributed retry safe (no shared mutable state).
- Metrics roll up for operational dashboards without scanning logs.
- Log volume is bounded by retention policy; logs and metrics have independent lifecycles.

## 15. Index Strategy

- `status`: scheduler/runtime views.
- `(workflow, workflowVersion)`: what a definition version has done.
- `idempotencyKey`: duplicate-execution guard lookup.
- `trigger event`: "what did this event cause".
- `correlationId`: end-to-end reconstruction of a run's full causal chain.
- `startedAt`/`finishedAt`: duration/health analysis.

## 16. Future Extensions

- Distributed retry/backoff policy per workflow type (policy, not schema).
- Job sagas: long-running multi-node workflows resume across crashes via stored node state.
- Tenant-scoped jobs (B5 matrix) reuse the same structure with a workspace scope field.
- Human-in-the-loop nodes (waiting on a User) become a job state (`waiting`) without new
  entities.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Automation Job.
- Completes the definition/execution split with 10-workflow.md: immutable versions, frozen
  context, bounded retry, cancellation, metrics, logs, idempotency.
- Satisfies GLOSSARY.md: automation is accountable (Audit Log actor) and cannot act
  anonymously.
- Complements 05/06: jobs trigger imports/executions; jobs are *actors*, imports are
  *evidence*.

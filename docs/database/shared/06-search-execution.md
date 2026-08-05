# 06 — Search Execution

Status: Draft v1.0 (Phase 4.2)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, MASTER_ARCHITECTURE.md §3 (Search → Raw Import), 04-search-job.md, 05-raw-import.md

## 1. Purpose

A Search Execution represents **one concrete run of a Search Job**: a single attempt to
collect results for the job's definition at a point in time. It is the operational unit
of the search pipeline — it carries the run's timing, outcome, retry context, cancellation,
and metrics — while the Search Job remains the durable intent.

Multiple executions belong to one Search Job; each execution is independent, time-boxed,
and attributable.

## 2. Responsibilities

- Record a single attempt to execute the job's definition against the job's sources.
- Capture when the run was scheduled, started, and finished.
- Enforce timeout, cancellation, and bounded retry for that attempt.
- Collect and retain run metrics (duration, records, per-source outcomes, errors).
- Anchor the raw imports and domain events produced by the run.

## 3. Lifecycle

```
created → running → completed
                ↘ failed (may retry) → completed
                ↘ timed-out (may retry) → completed
                ↘ cancelled (terminal)
```

An execution is a **single attempt**. If the run needs to be retried, a new execution is
created; the failed/timed-out one keeps its record and metrics. Only one execution of a
job is running at a time; the job serializes its own runs.

## 4. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| searchJob | reference | The job being executed. |
| attempt | counter | 1-based attempt number for this job's run sequence. |
| trigger | enum | `manual`, `schedule`, `workflow`. |
| scheduledFor | timestamp | When this run was intended to start. |
| startedAt | timestamp | Actual start. |
| finishedAt | timestamp | Actual end (completed/failed/timed-out/cancelled). |
| status | state | `created`, `running`, `completed`, `failed`, `timed-out`, `cancelled` (see State Machine). |
| timeoutPolicy | structure | Per-attempt time budget and what happens on expiry. |
| cancellation | structure | Who cancelled, when, and at which boundary (only set if cancelled). |
| metrics | structure | Run metrics: duration, sources queried, records fetched, imports created, errors, per-source breakdown. |
| resultSummary | structure | Rollup of the run's outcome (counts, freshness, outcome quality). |
| correlationId | identifier | End-to-end correlation with imports and domain events of this run. |

## 5. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Search Execution → Search Job | n : 1 | The job it attempts; many executions per job. |
| Search Execution → Import Source (usage) | n : m | Sources used in this run (snapshot of the job's usage at run time). |
| Search Execution → Raw Import | 1 : n | The imports this run captured. |
| Search Execution → Domain Events | 1 : n | Completion/failure/timeout/cancel events feeding workflows. |

## 6. Validation Rules

- searchJob, attempt, and trigger are required.
- `scheduledFor` must precede or equal the actual start window; backdating is rejected.
- status transitions follow the State Machine; a finished execution cannot return to
  `running`.
- timeoutPolicy must be present and bounded before the run starts.
- metrics are populated at completion; a `running` execution may carry partial counters.
- Only one `running`/`created` execution per job at a time.

## 7. Ownership

The **Search Job** owns its executions; the **User who owns the job** is accountable for
them. Each execution additionally records its trigger so accountability is precise (a
scheduled run vs a manual run vs a workflow-triggered run).

## 8. State Machine

```
created → running → completed
                ↘ failed
                ↘ timed-out
                ↘ cancelled
```

- `created`: attempt allocated, not yet started.
- `running`: work in progress; timeout budget is active.
- `completed`: collected results finished; imports and summary produced.
- `failed`: error ended the run; evidence of the failure retained.
- `timed-out`: the timeout budget expired; the run was halted at a safe boundary.
- `cancelled`: an authorized cancellation halted the run before completion.

Terminal states (`completed`, `cancelled`) are final. `failed` and `timed-out` are
retryable by creating a new execution with an incremented attempt.

## 9. Failure Handling

- Failures are recorded with the error category and stage; the job's definition is never
  mutated by a failed run.
- Partial results from a failed/timed-out run remain attributable to that execution and
  are never silently merged into a later run's summary.
- Cancellation halts at a safe boundary so no import is half-written.
- Failure, timeout, and cancellation each produce a domain event for operators/workflows.

## 10. Retry Strategy

- Retrying means **creating a new execution** with the next attempt number; the failed
  attempt's record is immutable history.
- Retry count is bounded by the job's retry policy; exceeding the bound stops scheduling
  and alerts the owner.
- Backoff is policy-driven and recorded per attempt.
- Re-processing a retry is idempotent at the import layer (contentHash dedupe), so a
  re-run never duplicates evidence.

## 11. Data Retention

- Execution records and their metrics are retained for audit and analysis.
- Retained duration at least as long as the raw imports they produced, so every import
  remains explainable by its run.
- Metrics aggregates feed future scaling/reliability review; raw execution detail can be
  archived under policy.

## 12. AI Interaction

- AI never creates, starts, or cancels executions directly.
- AI may propose job definitions that lead to executions, but the run itself is triggered
  by a human or an authorized schedule/workflow.
- AI quality analysis may consume execution metrics (e.g., "this source returns poor
  yield") as input to suggestions — never to auto-cancel a run.

## 13. Workflow Interaction

- Completion/failure/timeout/cancel are domain events that workflows subscribe to
  (notify owner, schedule verification, create follow-up tasks).
- A workflow may request a retry, which creates a new execution — it never reopens a
  finished one.
- A workflow can cancel a *scheduled* execution; cancelling a running one requires an
  authorized, audited decision.

## 14. Security

- Only the job owner and authorized roles may view or cancel an execution.
- Cancellation is an audited action recording the actor and boundary.
- Metrics are internal operational data, not exposed beyond authorized roles.
- A timeout or cancellation must never leave a partially attributed import claiming
  completion.

## 15. Index Strategy

- `searchJob` + `attempt`: the job's run history in order.
- `status`: pending runs the scheduler must start/complete.
- `trigger`: distinguishing manual vs scheduled vs workflow volume.
- `startedAt`/`finishedAt`: duration analysis and operational review.
- `correlationId`: end-to-end reconstruction of a run.

## 16. Future Scalability

- The job/execution split lets scheduling be asynchronous: the scheduler only advances
  state machines, it never blocks on source I/O.
- Distributed execution is anticipated: an execution is the unit that can run on any
  worker without shared mutable state.
- Metrics roll up so operational dashboards aggregate executions without scanning imports.
- High-frequency jobs produce many executions; per-job serialization keeps semantics
  simple while volume is absorbed by archiving old runs.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Search Execution (introduced in 04-search-job.md).
- Implements the MASTER_ARCHITECTURE.md §3 "Search → Raw Import" boundary.
- Complements 05-raw-import.md: the execution is the operational trigger; the import is
  the immutable evidence.

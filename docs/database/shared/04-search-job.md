# 04 — Search Job

Status: Draft v1.0 (Phase 4.1)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, MASTER_ARCHITECTURE.md §3 (Data Flow: Search → Raw Import), GLOSSARY.md (Search Job)

## 1. Purpose

Represents a **parameterized research request**: the durable definition of what the
platform should look for, under what constraints, from which sources, owned by whom, and
how it should be scheduled. A Search Job is the unit a User composes; its executions feed
the Raw Import pipeline.

The Search Job is the boundary between the **human intent** (search) and the **machine
execution** (imports, normalization, enrichment), per the data flow in MASTER_ARCHITECTURE.md §3.

## 2. Responsibilities

- Capture and validate the search definition (filters, keywords, geographic scope, limits).
- Define which Import Sources the search may draw from.
- Own the scheduling policy (one-off or recurring) and execution history.
- Track the job's state machine (draft → scheduled → running → completed/failed, plus
  pause/cancel) and its result summary.
- Provide the correlation anchor for every raw import and insight the job produces.

## 3. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| name | text | Human-readable job name. |
| definition | structure | The search parameters: keywords, filters, geo scope, result limits, exclusions. |
| sourceUsage | reference | Which Import Sources this job may use (n : m usage records). |
| schedulingPolicy | structure | One-off vs recurring; schedule; expiry/stop conditions. |
| owner | reference | The User accountable for this job. |
| status | state | `draft`, `scheduled`, `running`, `completed`, `failed`, `paused`, `cancelled` (see Lifecycle). |
| executionSummary | structure | Rollup of latest results (counts, freshness, outcome) without duplicating execution detail. |
| workspaceScope | reference | Optional future tenant scoping of the job. |
| createdBy / createdAt | audit | Who composed this job and when. |
| updatedAt | timestamp | Last mutation. |
| deletedAt | timestamp | Soft-delete marker. |

## 4. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Search Job → User (owner) | n : 1 | One accountable owner per job. |
| Search Job → Import Source | n : m | Sources the job may draw from, via usage records. |
| Search Job → Search Execution | 1 : n | Every run of the job is a distinct execution. |
| Search Execution → Raw Import | 1 : n | An execution produces raw imports attributed to the job's sources. |
| Search Job → Domain Events | 1 : n | Completion/failure events feed workflows (see 12). |

## 5. Lifecycle

```
draft → scheduled → running → completed
                        ↘ failed (retryable)
              scheduled ⇄ paused
              (any scheduled/running state) → cancelled
```

- `draft`: definition being composed; not yet eligible to run.
- `scheduled`: validated, awaiting its run time.
- `running`: an execution is in progress.
- `completed`: execution finished; results produced.
- `failed`: execution ended in error; the job may be rescheduled.
- `paused`: scheduling suspended; an in-flight run is halted at a safe boundary.
- `cancelled`: terminal; no further executions.

Execution history is never discarded when a job transitions states; every run is retained.

## 6. Validation Rules

- name is required.
- definition must be structurally valid: known filter vocabulary, bounded result limits,
  valid geographic scope, explicit exclusions where required.
- owner is required before the job can leave `draft`.
- At least one Import Source is required before scheduling.
- A recurring job must define a stop condition or a finite horizon.
- Status transitions follow the lifecycle state machine; cancelling a running job is an
  explicit, audited decision.

## 7. Soft Delete Strategy

Soft delete with `deletedAt`. Deleting a job never deletes its execution history, raw
imports, or provenance — records it produced remain attributed to their source and to the
execution. Deletion is only allowed when the job is not `running`; history is retained and
the job's ownership and audit trail are preserved.

## 8. Audit Requirements

- Job composition, scheduling, pause, cancel, and deletion are audited.
- Each execution records its trigger (manual, schedule, workflow), actor, and outcome.
- Definition changes between runs are audited so results can be explained ("this run used
  the old filters").
- Parameter changes that affect scope are prominent in the audit trail.

## 9. Index Strategy

- `owner`: jobs by accountable user.
- `status`: operational dashboard queries.
- Next run time (derived from schedulingPolicy): the scheduler's dispatch view.
- Execution history by job: result retrieval and re-run decisions.
- Latest execution per job: freshness and summary lookups.

## 10. Future Scalability

- Many concurrent jobs require asynchronous execution boundaries; the entity must not
  assume in-line processing.
- Recurring jobs with high frequency must not duplicate definitions; schedule policy is
  data, not schema.
- Global-scope jobs and per-workspace jobs may coexist; workspace scoping is additive.
- Execution results should roll up so the job list never re-scans raw imports.
- Job templates (reusable definitions) are a future convenience layered on this entity.

## 11. AI Interaction

- AI never runs, schedules, pauses, or cancels jobs directly.
- AI may **propose** search definitions ("suggested filters for this target segment") as
  draft jobs or draft parameters, which a human reviews and schedules.
- AI-derived results are attributed to the job that collected the underlying data, keeping
  insight provenance intact.

## 12. Workflow Interaction

- Job completion/failure are domain events; workflows react (e.g., notify owner, spawn a
  follow-up task, trigger verification of new records).
- Workflows can request a re-run by creating a new execution of the same job, never by
  mutating history.
- Workflows may pre-fill a draft job (e.g., "re-run last quarter's search") but the final
  schedule remains a human or authorized decision.

## 13. Security Considerations

- Job definitions are user input and must be validated against the filter/geo vocabulary
  (bounded parameters, no arbitrary expressions).
- Result limits are enforced as hard ceilings to bound cost and volume.
- Owner-scoped: only the owner (and authorized roles) may view/modify/cancel a job.
- Recurring jobs carry a stop condition so they cannot run indefinitely.
- Workspace scoping (future) isolates job visibility; it never removes the owner.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Search Job.
- Introduces the Search Execution concept (its concrete design is deferred to Phase 4.2
  alongside Raw Import).
- Follows GLOSSARY.md: search intent is owned by humans; machine execution is traceable.

# 08 — Search API

Status: Draft v1.0 (Phase 5.4)
Cross-referenced by: API_GUIDELINES.md, MASTER_ARCHITECTURE.md §8, 03-search-builder.md, 04-search-job.md, 06-search-execution.md, 02-search-pipeline.md §3, 01-provider-architecture.md

## 1. Purpose

The Search API is the operational surface of the search pipeline: clients create and
manage Search Jobs, observe Search Executions, and consume results **as they arrive**.
It is architecture for the API contract — resources, lifecycle, streaming semantics,
response model, and error strategy — aligned with API_GUIDELINES.md (base path
`/api/v1`, kebab-case resource naming, envelope `{ data, meta }`, cursor pagination,
structured error shape). No code, DTOs, controllers, or services are specified here.

## 2. Search Job

The Search Job resource maps to the durable intent (04-search-job.md). It is
workspace-scoped (ADR-010). The API exposes the job, not its internals.

### 2.1 Lifecycle

Jobs expose the lifecycle documented in 02-search-pipeline.md §4:

```
created → running → completed
             ↘ paused → running
             ↘ cancelled (terminal)
created → running → failed → retry → running → completed
             ↘ expired (terminal)
```

- The API presents **state transitions**, never internal machinery. Clients read
  `status` and observe transition events (Section 3.4).
- State-changing calls are audited (actor + boundary + reason), per 06-search-execution.md
  §14.

### 2.2 Ownership

- A Job is owned by the user who created it and visible within its workspace
  (ADR-010). The API enforces read/view/cancel/delete scopes by role (12-role.md,
  13-permission.md).
- Ownership is recorded for accountability (06 §7); transferring a job is an audited,
  role-gated action.

### 2.3 Cancellation

- A `created`/`running`/`paused` job can be cancelled. Cancellation is a job-level
  intent: it cancels the job's runs at safe boundaries and is terminal
  (02 §4, 06 §14).
- Cancelling a running job is an authorized, audited decision; the running execution
  halts at a safe boundary and no import is half-written (06 §9).
- Cancellation is recorded with actor and boundary; repeated cancels are idempotent
  (API_GUIDELINES: DELETE-style idempotency).

### 2.4 Resume

- **Job-level resume** applies to `paused` jobs (unpause → returns to `running`) and
  to `failed`/`expired` jobs **via re-validation**: resuming never bypasses the Search
  Builder's plan validation (03 §4) — a job resumes only if its plan still validates
  against current taxonomies. Re-validated resumes produce new executions; old runs
  stay as history (06 §10).
- **Execution-level resume does not exist** — an execution is one attempt
  (06 §3); a failed/timed-out run is retried as a new execution, never reopened
  (Section 5).

### 2.5 Expiration

- Jobs carry a validity horizon (02 §4 `expired`). Expiration is terminal and audited.
- Expiring a job never expires its imports, executions, or history — evidence outlives
  the job (06 §11).

### 2.6 Retry

- Retry is exposed as a **bounded, re-validating action** on a `failed` job: it creates
  a new execution with the next attempt number (06 §10), subject to the job's retry
  policy. Exceeding the retry bound stops scheduling and alerts the owner.
- The API never re-opens a finished attempt; it schedules a new one.

## 3. Search Execution

The Search Execution resource models one attempt (06-search-execution.md).

### 3.1 Execution model

- Executions are nested under the job (`/api/v1/search-jobs/:jobId/executions`) and
  expose: trigger, attempt, scheduledFor/startedAt/finishedAt, status, timeoutPolicy,
  cancellation, metrics, resultSummary, correlationId (06 §4).
- Only one `created`/`running` execution per job at a time; the API honors the job's
  serialization (06 §3) rather than exposing concurrent runs.
- Execution records are immutable after finishing (06 §9); the API serves history, it
  does not edit it.

### 3.2 Progress

- Executions expose **per-stage progress** (which pipeline stages produced what) as a
  live, queryable snapshot — not just a terminal status. Progress is part of the
  execution's metrics (06 §4) and is updated as stages emit (02 §3).
- A running execution may carry partial counters; a finished one has the final rollup.

### 3.3 Logs

- Logs are attributed to the execution's correlationId so a run is fully
  reconstructable (06 §4). The API exposes logs per execution with level + stage +
  timestamp + provider context (01 §4 routing decisions).
- Logs are operational data; they follow role scoping and never contain secrets or
  credentials (01 §3.4).

### 3.4 Events

- Executions publish lifecycle events (created/started/completed/failed/timed-out/
  cancelled) and per-provider outcomes (01 §4.5 routing, 06 §4 metrics). The API serves
  events in two forms:
  - **Historical**: a queryable event feed per execution/job (offset/cursor
    pagination per API_GUIDELINES).
  - **Live**: an event stream (Section 4) for subscribing clients/workflows
    (MASTER_ARCHITECTURE.md §8).

### 3.5 Provider executions

- Provider routing, fallback, and retry are recorded per attempt (01 §4.5, 06 §4). The
  API exposes per-provider outcomes within an execution: which providers were tried, in
  what order, with what result and retry count — making every result's provenance
  observable without exposing provider internals.

### 3.6 Streaming

- Execution results are delivered **progressively** (02 §3). The execution exposes a
  stream of result chunks and stage events (Section 4) so clients render partial results
  before the run completes.

## 4. Streaming API

The Search API is streaming-first: results and events are delivered over a
server-push/long-lived stream, with a JSON request/response layer for management
operations (API_GUIDELINES verbs still apply to job/execution resources).

### 4.1 Progressive delivery

- A client opens a stream for an execution (or a job's active execution) and receives
  results as stages emit them — no polling, no wait-for-completion.
- Stream frames are typed: `stage_event`, `result_chunk`, `progress`, `warning`,
  `error`, `completion`, `heartbeat`.

### 4.2 Chunking

- Results are delivered in **bounded, ordered chunks** (stable framing with a sequence
  number per execution). Chunk boundaries are defined by the pipeline's streaming model
  (02 §3), never by arbitrary client size.
- Chunks reference immutable result records (Raw Imports / canonical candidates) via
  **result references** (Section 4.5), not by embedding mutable bodies.

### 4.3 Partial success

- A stream may end with `partial` success: some providers/stages succeeded, others
  failed (06 §9). The completion frame carries the partial-success boundary, per-source
  outcomes (Section 3.5), and never conflates partial results with a full run's summary.

### 4.4 Cancellation

- A client may cancel the stream (stop listening) without cancelling the job; cancelling
  the job/execution is the audited, role-gated operation (Sections 2.3, 5). Stream
  cancellation and job cancellation are distinct and never conflated.

### 4.5 Heartbeat

- The server emits periodic heartbeats to keep the connection alive and signal liveness.
- Heartbeats carry the stream position (sequence) so a client can detect staleness and
  resume cleanly (Section 4.6).

### 4.6 Reconnect

- Streams are **resumable**: each frame is numbered; a client that disconnects
  reconnects with its last received sequence and the server replays from there. No
  frame is lost, none is duplicated.
- Resume state is tied to the execution's immutable record, so replay is always
  deterministic (06 §9).

### 4.7 Result references

- Results are referenced (`executionId`, `sequence`, `resultReference`), not duplicated
  into the stream. Clients fetch full records through the execution's result endpoint
  (cursor-paginated). This keeps streaming cheap and records authoritative.

## 5. Response Model

Every Search API response — management or stream completion — uses the envelope shape
from API_GUIDELINES (`{ data, meta }`) plus a Search-specific status surface:

| Element | Meaning |
|---|---|
| **Status** | The resource's lifecycle status (job: 02 §4; execution: 06 §3). |
| **Progress** | Per-stage progress for an execution (Section 3.2); for jobs, aggregate over the active execution. |
| **Metadata** | CorrelationId, attempt, trigger, timestamps, plan fingerprint (03 §7), pagination (`data`/`meta` per API_GUIDELINES). |
| **Warnings** | Non-fatal notices (degraded provider, missing optional evidence, plan re-validated) — structured, machine-readable. |
| **Errors** | Structured error shape per API_GUIDELINES (`error.code`, `message`, optional `details`); stage/provider-scoped where relevant (Section 5.4). |
| **Result references** | Pointers to delivered results (Section 4.7); never embedded mutable bodies. |

Stream completion frames and management responses both carry this surface, so a client
handling either path reads the same shape.

## 6. Error Strategy

Errors map to the pipeline's error strategy (02 §6) and API_GUIDELINES status/error
shape.

| Failure | API behavior | Status mapping |
|---|---|---|
| **Timeout** | Per-attempt timeout budget (06 §4) halts the run at a safe boundary; execution ends `timed-out`, partial results remain attributable; retry = new execution. | Stream: `timed-out` completion; management: 200 with error/status surface. |
| **Provider failure** | Absorbed per provider policy (fallback within attempt, 01 §4.5); recorded per-source; never a whole-run failure unless all providers fail. | Warnings + per-source errors in the stream; whole-run failure only at the terminal boundary. |
| **Partial completion** | Explicit `partial` completion with the success/failure boundary (Section 4.3); never conflated with full completion. | Stream completion frame; management history records it. |
| **Retry** | Bounded; creates a new execution (06 §10); API exposes attempts as separate immutable records; never re-opens a finished attempt. | 201 on new execution creation; history shows the chain. |
| **Cancellation** | Audited, role-gated, terminal at safe boundaries (Sections 2.3, 4.4). | Terminal `cancelled` status; idempotent repeated cancels. |
| **Resume** | Job-level resume = unpause or re-validated restart (Section 2.4); stream-level resume = replay from sequence (Section 4.6). Never execution-level reopen. | 200 with new status; stream replays. |

Client errors (invalid plan, unknown filters, bad sequence, forbidden action) follow
API_GUIDELINES: 400 structural, 422 business/validation (03 §4), 403 authorization,
409 state conflicts (e.g., retry on a non-failed job).

## 7. Search History

Search History persists the plans users actually run and the reusable forms around
them — feeding Saved Searches (03 §5) and the pipeline's job definitions.

| Kind | Resource semantics | Notes |
|---|---|---|
| **Recent** | Read-only history of executed plans (plan fingerprint + execution/result references). | Sourced from execution records (06); never editable. |
| **Saved** | Named, user-owned plans (03 §5 Favorites); workspace-scoped. | Re-validates on reuse (03 §4). |
| **Pinned** | User-curated plans pinned for prominence. | Pure presentation preference; no semantic difference from Saved. |
| **Templates** | Canonical plan skeletons, usually per Search Profile (03 §5–6); role-governed. | Managed artifacts, versioned like the taxonomies they reference. |

History rules:

- History is read-mostly; edits are limited to naming/pinning and are audited.
- Any reuse path re-validates against current taxonomies (03 §4.5) — history never
  bypasses the plan boundary.
- History is workspace-scoped (ADR-010) and shares the same permission model as jobs.

## 8. API Principles

1. **Deterministic** — identical plans produce identical fingerprints (03 §7); the API
   never applies hidden transformations to a request.
2. **Streaming-first** — results and events are progressive (02 §3, Section 4); polling
   is neither assumed nor required.
3. **Event-driven** — everything observable is an event (Section 3.4) consumed by
   clients and workflows (MASTER §8).
4. **Resumable** — streams replay from sequence (Section 4.6) and jobs resume through
   validated restart (Section 2.4); no progress is lost.
5. **Observable** — per-stage progress, logs, per-provider outcomes, and history are
   exposed (Sections 3, 7); every result is attributable.
6. **Versioned** — API versioning per API_GUIDELINES (`/api/v1`); breaking changes
   bump the version, and existing behavior never changes under a served version.

## Related Review Decisions

- Aligns with API_GUIDELINES.md throughout (base path, naming, verbs, status codes,
  envelope, cursor pagination, error shape).
- Surfaces the lifecycle of 04-search-job.md (02 §4) and 06-search-execution.md
  (single-attempt, serialized, retry = new execution) without exposing internals.
- Implements 02-search-pipeline.md §3 streaming model and 01-provider-architecture.md
  routing observability.
- Enforces 03-search-builder.md validation and saved-search semantics.
- No conflict with prior phases: Resume is defined at job/stream level and explicitly
  excluded at execution level, matching 06's single-attempt model.

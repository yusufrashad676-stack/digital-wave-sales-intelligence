# 02 — Search Pipeline

Status: Draft v1.0 (Phase 5.1)
Cross-referenced by: MASTER_ARCHITECTURE.md §3 (Search → Raw Import), 01-provider-architecture.md, 03-import-source.md, 04-search-job.md, 06-search-execution.md, 05-raw-import.md, 07-duplicate-candidate.md, 08-verification-record.md, 09-data-quality-record.md, 10-workflow.md, 11-automation-job.md

## 1. Purpose

The Search Pipeline transforms a **search intent** into **trusted, verifiable,
opportunity-ready intelligence**. It is the architectural backbone of the system: every
stage owns exactly one responsibility, stages are independent and event-driven, and raw
evidence is never mutated as it flows downstream.

```
Search → Providers → Normalization → Matching → Merge → Enrichment
      → Verification → Data Quality → Opportunity → AI Insights → CRM
```

This document defines the pipeline's stage model, its streaming semantics, the Search
Job/Execution machinery that drives it, and the error strategy that keeps it reliable.

## 2. Stage Model

Every stage is a **consumer of upstream output and producer of downstream input**, with
one responsibility, one input contract, and one output contract. Stages never reach
backward: there are **no circular dependencies** (Section 8).

### 2.1 Search

- **Purpose**: turn intent into a durable, repeatable collection plan.
- **Responsibilities**: hold the job definition (query, sources, filters, schedule,
  policy); allocate and serialize executions.
- **Input**: a human or workflow trigger (manual, schedule, workflow —
  06-search-execution.md §4).
- **Output**: a Search Execution (one attempt) carrying trigger, budget, and the job's
  source usage snapshot.
- **Events**: execution created/started/completed/failed/timed-out/cancelled.
- **Failure/retry**: a failed attempt is retried as a **new execution** (bounded by the
  job's retry policy); the failed attempt is immutable history.
- **Ownership**: the Search Job owner (04-search-job.md); workspace-scoped per ADR-010.
- **Dependencies**: none upstream.

### 2.2 Providers

- **Purpose**: acquire raw external evidence through the Provider layer.
- **Responsibilities**: route the request through the Provider Registry
  (01-provider-architecture.md §4), invoke providers, apply fallback/retry/health
  policy, capture byte-faithful evidence.
- **Input**: the execution's request, budget, and capability requirements.
- **Output**: result sets with provenance + raw evidence.
- **Events**: provider outcomes per execution; routing/fallback/retry recorded in the
  execution's metrics (06 §4).
- **Failure/retry**: provider failures are absorbed here (fallback within attempt);
  a provider that fails permanently is deprecated, never silently dropped.
- **Ownership**: the Provider Registry; per-provider policy.
- **Dependencies**: Search (it consumes the execution).

### 2.3 Normalization

- **Purpose**: convert heterogeneous provider output into one standard representation.
- **Responsibilities**: map provider-specific fields to canonical attribute shapes
  (contact methods, addresses per ADR-008, employment per ADR-009); retain the raw
  evidence as the immutable record (05-raw-import.md); drop nothing that later stages
  may need.
- **Input**: provider result sets + raw evidence.
- **Output**: Raw Imports (immutable, integrity-fingerprinted) + normalized candidate
  attribute values, each traceable to its import.
- **Events**: import captured; candidate attributes emitted.
- **Failure/retry**: a normalization failure preserves the raw evidence for diagnosis;
  re-processing is idempotent via contentHash dedupe (06 §10) so retries never
  duplicate evidence.
- **Ownership**: the normalization stage; evidence provenance via Import Source.
- **Dependencies**: Providers.

### 2.4 Matching

- **Purpose**: detect that two normalized candidates are likely the same real-world
  subject.
- **Responsibilities**: compare candidates against existing subjects using match rules
  and provider evidence; produce **advisory** duplicate candidates — matching never
  changes data.
- **Input**: normalized candidates + existing subjects.
- **Output**: Duplicate Candidates (07-duplicate-candidate.md) — `open → decided
  (confirmed/rejected)` and expiring; **never auto-merge**.
- **Events**: duplicate candidate created/decided/expired.
- **Failure/retry**: inconclusive matches remain open for human/verification decision;
  a matching failure never corrupts the candidate or the existing record.
- **Ownership**: matching rules; decisions belong to authorized users.
- **Dependencies**: Normalization.

### 2.5 Merge

- **Purpose**: consolidate confirmed duplicates into one resolved subject without
  losing provenance.
- **Responsibilities**: apply only **confirmed** duplicate decisions (never matching
  suggestions); consolidate attributes while preserving each value's source, import,
  and validity; never silently overwrite (every change is attributable).
- **Input**: a confirmed Duplicate Candidate + the two records it links.
- **Output**: one resolved subject; superseded links preserved as history.
- **Events**: merge performed; subject changed.
- **Failure/retry**: a merge is atomic per confirmed decision; partial merges are
  rejected.
- **Ownership**: merge stage; executed only under the decision recorded on the Duplicate
  Candidate.
- **Dependencies**: Matching (confirmed decisions only).

### 2.6 Enrichment

- **Purpose**: add value by combining collected evidence into derived attributes.
- **Responsibilities**: two sub-activities — (a) **enrichment collection**: invoke
  enrichment providers (01, 05-enrichment-engine.md §3) **through the Provider
  Registry**, exactly like any other provider, so every enrichment result is a Raw
  Import; (b) **attribute derivation**: compute derived fields (activity signals,
  contact reachability, source freshness) from collected, normalized evidence. The
  stage **never calls providers directly** — all provider calls go through the
  Registry — and derives only from collected, imported evidence, so Enrichment stays
  deterministic and evidence-bound.
- **Input**: normalized/merged subject attributes + their provenance; enrichment
  provider requests.
- **Output**: derived/aggregated attributes, each derived from cited evidence.
- **Events**: enriched attribute computed.
- **Failure/retry**: derivation failures are recorded per attribute; the subject is
  never left half-enriched — either the attribute is present with evidence or absent.
- **Ownership**: enrichment rules.
- **Dependencies**: Merge.

### 2.7 Verification

- **Purpose**: confirm or reject attributes with evidence of the right strength.
- **Responsibilities**: verify attributes per subject/provider/attribute with a validity
  window; produce immutable Verification Records
  (08-verification-record.md): `confirmed`, `not-confirmed`, `inconclusive`.
- **Input**: enriched attributes + collected evidence.
- **Output**: Verification Records that later stages may trust.
- **Events**: record verified; verification expired.
- **Failure/retry**: no evidence of the required strength yields `inconclusive`, never
  a false confirmation; verification never edits the subject directly.
- **Ownership**: verification policy (per provider/attribute/subject strength).
- **Dependencies**: Enrichment.

### 2.8 Data Quality

- **Purpose**: report the trustworthiness of records from evidence, without editing them.
- **Responsibilities**: compute quality snapshots (completeness, freshness,
  verifiability, conflict) from verification outcomes; produce Data Quality Records
  (09-data-quality-record.md): `computed → valid → superseded`; evidence-derived only.
- **Input**: Verification Records + attribute provenance.
- **Output**: Data Quality Records; quality signals to Opportunity and AI Insights.
- **Events**: quality record computed/superseded.
- **Failure/retry**: a missing evidence set yields a quality record, not a write to the
  subject; source data is never mutated by this stage.
- **Ownership**: quality policy.
- **Dependencies**: Verification.

### 2.9 Opportunity

- **Purpose**: materialize an actionable sales object from verified intelligence.
- **Responsibilities**: evaluate a verified subject against the organization's pipeline
  criteria (GLOSSARY — "Engagement & Opportunity": Lead = subject + metadata, role per
  team/workspace); open/create Opportunities from confirmed, high-quality subjects;
  record the lead role the subject plays.
- **Input**: verified, high-quality subject intelligence.
- **Output**: Opportunities/Leads with accountable owners and source lineage.
- **Events**: opportunity created/advanced.
- **Failure/retry**: no verified-quality intelligence, no opportunity; this stage never
  manufactures opportunities from unverified evidence.
- **Ownership**: sales roles/teams (workspace-scoped).
- **Dependencies**: Data Quality.

### 2.10 AI Insights

- **Purpose**: produce analytical suggestions from evidence; never act unilaterally.
- **Responsibilities**: analyze execution metrics, quality records, and verified
  attributes to suggest next steps (outreach hints, source-quality trends, stale
  verification); propose, never execute (06 §12, 08).
- **Input**: verified data + Data Quality Records + execution metrics.
- **Output**: insight records and suggestions for humans/workflows.
- **Events**: insight produced.
- **Failure/retry**: AI never creates/cancels executions, never confirms verification,
  never auto-merges; suggestions are advisory and auditable.
- **Ownership**: insight model + human approval.
- **Dependencies**: Data Quality; reads (never writes) earlier stages.

### 2.11 CRM

- **Purpose**: export opportunity-ready intelligence to external CRM systems.
- **Responsibilities**: map internal Opportunity/Lead shape to the CRM contract; emit
  export events for workflows (10-workflow.md); record sync status; never leak
  unverified data to the CRM.
- **Input**: verified Opportunities + their lineage.
- **Output**: CRM records + sync state; export events.
- **Events**: exported/export-failed.
- **Failure/retry**: export failures retry per the automation job policy
  (11-automation-job.md) and alert operators; the internal record is always the source
  of truth.
- **Ownership**: integration/automation roles.
- **Dependencies**: Opportunity.

## 3. Streaming Model

The pipeline is **progressive, not transactional**: results flow downstream as they are
collected, so a Search Job yields value before it fully completes.

- Providers emit results incrementally; Normalization processes each result as it
  arrives and emits its Raw Import + candidates immediately (bounded by per-attempt
  budget — 06 §4 timeoutPolicy).
- Downstream stages consume **whatever evidence has been emitted so far**; partial runs
  are always attributable to their execution (06 §9) and are never silently merged into
  a later run's summary.
- Completion of an execution publishes the run's resultSummary; consumers that depend on
  "all results" (e.g., final Data Quality rollup) subscribe to completion events rather
  than assuming synchronous delivery.
- Progress is observable: each execution exposes per-stage progress and logs
  (Section 5), feeding operators and workflows without polling external systems.

## 4. Search Job Lifecycle

The Search Job is the durable intent; its runs are Search Executions (04/06). The job
lifecycle:

```
created → running → completed
             ↘ paused → running
             ↘ cancelled (terminal)
created → running → failed → retry → running → completed
             ↘ expired (terminal)
```

| State | Meaning |
|---|---|
| Created | Job definition recorded; not yet scheduled. |
| Running | Job has an active or queued execution; runs are serialized (06 §3). |
| Paused | Scheduling suspended; the running attempt may finish at a safe boundary, no new runs start. |
| Completed | Job's definition satisfied; final run finished. |
| Cancelled | Authorized cancellation; terminal. |
| Failed | The job's retry bound was exceeded; alert to owner. |
| Retry | Transition used to create the next execution attempt (06 §10). |
| Expired | Job definition beyond its validity horizon with no runs; terminal. |

- Transitions are recorded; `paused`/`cancelled` are audited actions with actor and
  boundary (06 §14).
- A failed job never mutates its definition; re-scheduling always creates a new
  execution (06 §9).

## 5. Search Execution

A Search Execution is **one attempt** (06-search-job — 06-search-execution.md). Its
relationship to the pipeline:

- **job/execution split**: the job holds intent; the execution holds the run's timing,
  trigger, metrics, cancellation, and correlationId (06 §4).
- **provider calls**: the execution invokes providers through the Registry
  (01 §4); routing, fallback, and retry are recorded per attempt.
- **stages**: the execution drives stage 1–3 synchronously (Search → Providers →
  Normalization) and publishes events for stages 4+; stages 4+ are asynchronous
  consumers.
- **progress**: per-stage progress is part of the execution's metrics, updated live.
- **logs**: logs are attributed to the execution's correlationId so a run is fully
  reconstructable.
- **retry**: retrying means a new execution with an incremented attempt; the failed
  attempt is immutable history (06 §10).
- **serialization**: only one execution of a job runs at a time (06 §3), so streaming
  and the event model never create concurrent runs of the same job.

## 6. Error Strategy

Errors are categorized so recovery is precise and silent corruption is impossible.

| Category | Handling |
|---|---|
| Provider failure | Absorbed at Providers (fallback to next eligible provider within the attempt); recorded in metrics; permanent failure → deprecation (01 §5). |
| Timeout | Per-attempt timeout budget; the run halts at a safe boundary; partial results stay attributed to that execution; retry as a new execution (06 §9–10). |
| Partial success | Some providers succeeded, some failed; successful evidence flows on, failures are recorded per source; nothing is silently merged into a later run's summary. |
| Retry | Bounded by the job's retry policy; creates a new execution; idempotent at the import layer (contentHash dedupe). |
| Dead letter | Evidence or events that cannot be processed are retained with the error and correlationId; they are diagnosable and re-drivable, never dropped. |
| Cancellation | Halts at a safe boundary; no import is half-written; audited with actor and boundary (06 §14). |

Cross-cutting rules:

- A failure never mutates a job definition, a subject, or imported evidence.
- Every error is recorded with category, stage, execution, and correlationId.
- AI never makes error-handling decisions (no auto-cancel, no auto-retry escalation)
  — see 06 §12.

## 7. Ownership and Accountability

| Artifact | Owner |
|---|---|
| Search Job / Execution | Job owner (workspace-scoped, ADR-010). |
| Provider Registry & routing | Registry (01 §4); provider policy per provider. |
| Raw Imports | Import Source provenance (03/05). |
| Duplicate decisions | Authorized users (07). |
| Merges | Merge stage; executed only on confirmed decisions. |
| Verification | Verification policy (08). |
| Data Quality | Quality policy (09). |
| Opportunity/Lead | Sales roles/teams (GLOSSARY "Engagement & Opportunity"). |
| AI insights | Human approval (06 §12). |
| CRM sync | Integration/automation roles (10/11). |

## 8. Design Rules

1. **Independent stages** — each stage owns its data, its events, and its policy; a
   stage can be replaced or scaled without touching its neighbors.
2. **One responsibility each** — no stage performs another stage's job (e.g., Enrichment
   never collects; Verification never merges).
3. **Event-driven** — stages communicate via domain events
   (MASTER_ARCHITECTURE.md §8), never by shared mutable state or direct calls between
   non-adjacent stages.
4. **No circular dependencies** — the stage graph is strictly linear
   (Search → … → CRM); later stages read earlier evidence, never write back to it.
5. **Evidence over truth** — only Verification Records elevate evidence to fact; every
   downstream stage cites the evidence it used.
6. **Raw evidence is immutable** — nothing upstream is mutated by downstream work
   (05-raw-import.md).
7. **Attribution always** — every value, event, and error traces to its execution,
   import, and provider (correlationId).
8. **Automation mirrors manual flow** — Automation Jobs (11) drive the same stage graph
   as manual runs; they never bypass verification or decision stages.

## Related Review Decisions

- Implements MASTER_ARCHITECTURE.md §3 data flow (Search → Raw Import) and the event
  model (§8).
- Aligns with ADR-010 (workspace-scoped Search Job/Execution), ADR-008 (plain lat/lng
  normalization), ADR-009 (employment), ADR-006 (contact-method joins as the schema's
  ownership model).
- Complements 01-provider-architecture.md (stage 2), 03/04/05/06 (Search machinery),
  07 (matching), 08 (verification), 09 (quality), 10/11 (workflows/automation).
- Enrichment is detailed in 05-enrichment-engine.md (Phase 5.3) and reconciled with
  stage 2.6: enrichment collection goes through the Provider Registry, attribute
  derivation consumes collected evidence only (Phase 5.3 reconciliation note).

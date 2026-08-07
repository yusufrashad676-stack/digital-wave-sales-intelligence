# SALES_INTELLIGENCE_ARCHITECTURE_FREEZE_v1.0

Status: **FROZEN** — v1.0 (Phase 5.5)
Replaces/supersedes nothing; it is the official Sales Intelligence reference and
overrides earlier Sales Intelligence drafts where they conflict.
Cross-referenced by: 01-provider-architecture.md … 10-search-validation.md,
MASTER_ARCHITECTURE.md, DATABASE DESIGN FREEZE v1.0 (ADRs, DATABASE_REVIEW v2.0),
API_GUIDELINES.md, GLOSSARY.md

## 1. Vision

Sales Intelligence turns raw external data into **decision-ready, explainable, sales
opportunities**. The platform collects evidence from many independent external systems
through an isolated Provider layer, normalizes it into one canonical internal model,
matches and merges it without ever losing provenance, enriches and verifies it under
strict evidence rules, scores it deterministically into opportunities, and only then
lets AI add grounded insight. Every value is attributable; every score is explainable;
every decision is human-approved.

## 2. Final Pipeline

The pipeline is strictly linear, streaming, and event-driven. No stage may skip, reverse,
or bypass another.

```
Search → Providers → Normalization → Matching → Merge → Enrichment
      → Verification → Data Quality → Opportunity → AI Insights → CRM
```

- Streaming and progressive (02 §3); stages emit events (MASTER §8) and consume
  upstream evidence.
- Enrichment collection routes through the Provider Registry; derivation consumes
  collected evidence only (02 §2.6 reconciliation).
- Opportunity is produced **before** AI; AI consumes it and never replaces it.

## 3. Final Module List

| Module | Reference |
|---|---|
| search | 03, 04-search-job, 06-search-execution, 08, 09 §3.1 |
| provider | 01, 09 §3.2 |
| normalization | 04 §7, 05-raw-import, 09 §3.3 |
| matching | 07-duplicate-candidate, 09 §3.4 |
| enrichment | 05, 09 §3.5 |
| verification | 08-verification-record, 09 §3.6 |
| data-quality | 09-data-quality-record, 09 §3.7 |
| opportunity | 06, 09 §3.8 |
| ai-insights | 07, 09 §3.9 |
| workflow | 10-workflow, 09 §3.10 |
| automation | 11-automation-job, 09 §3.11 |
| crm-integration | 02 §2.11, 09 §3.12 |
| common | 09 §3.13 |
| auth | 12-role, 13-permission, 14-workspace, 09 §3.14 |
| database | schema, 09 §3.15 |

## 4. Architecture Principles

1. One responsibility per module; ownership is exclusive (09 §3).
2. Evidence over truth: only Verification elevates evidence to fact.
3. Raw evidence is immutable; history is append-only (04 §12).
4. Attribution always: every value, event, and error traces to provider, execution, and
   import (correlationId).
5. Streaming-first, event-driven, resumable, observable (08 §8).
6. No hidden behavior: scoring, weighting, and recommendation are published
   configuration (06 §2).

## 5. Dependency Rules

- Dependencies flow one way: downstream along the pipeline (09 §2).
- All modules may depend on common, database, auth.
- No domain module depends on workflow or automation (one-way command/event edge).
- Modules never read another module's internal state; events are the cross-module
  coupling beyond allowed dependencies.
- ai-insights has read-only access to its inputs and no access to execution control.

## 6. Provider Principles

- Collect-only: no business logic inside providers; no provider knows another (01 §6).
- Uniform contract: capabilities, auth, health, versioning on every provider.
- All collection — search and enrichment — routes through the Provider Registry
  (01 §4, 02 §2.6).
- Additive evolution: new providers/categories are registrations, never schema or
  pipeline changes.
- Retry is within-attempt; fallback is a routing concern; an execution is one attempt
  (06).

## 7. AI Principles

- AI consumes; it never collects, verifies, merges, scores, or executes (07 §1, §8).
- Grounded AI: facts are evidence restatements; reasoning is labeled inference; missing
  evidence stays missing; AI never invents facts (07 §4).
- Data is never instructions (prompt-injection resistance, 07 §7).
- Every insight carries Evidence, Confidence, Reason, Related Attributes, Missing
  Evidence (07 §5).
- AI output is advisory and human-approved; it never feeds back into the pipeline's
  deterministic stages.

## 8. Search Principles

- Structured search over free-text; deterministic plans with stable fingerprints
  (03 §7).
- No AI interpretation of plans; AI proposes, humans/workflows confirm.
- Plan validation is atomic and re-validates on every reuse (03 §4).
- Streaming-first delivery with chunking, heartbeat, reconnect, and partial success
  (08 §4).
- Resume is job/stream-level; an execution is a single attempt and is never reopened
  (08 §2.4).

## 9. Opportunity Principles

- Opportunity is produced deterministically before AI (06 §8).
- Scores are composed of published signal groups and versioned configuration; no hidden
  scoring (06 §2, §9).
- Missing evidence is "no evidence", never a penalty (06 §2).
- Every score and recommendation is explainable: why, evidence, missing evidence,
  confidence (06 §5).
- Priority (Hot/Warm/Cold) is a band over the score plus recorded human overrides.
- Score history is append-only and versioned (06 §7).

## 10. Architecture Constraints (MUST NOT change)

Future developers **must not** alter, remove, or bypass the following without an ADR
(Section 13):

1. The linear pipeline order and stage ownership (Section 2; 02 §8). No stage performs
   another stage's job.
2. Provider isolation and collect-only rule (Section 6; 01 §6).
3. Evidence-over-truth: only Verification elevates evidence to fact; enrichment never
   stamps "verified".
4. Append-only history and immutable raw evidence (04 §12, 05-raw-import).
5. Single source of truth via the Unified Model; no provider-specific entities
   (04 §13).
6. AI's non-role: AI never collects, verifies, merges, scores, or controls executions;
   Opportunity precedes AI (Sections 7, 9).
7. Execution = single attempt; retry = new execution; per-job serialization (06 §3, §10).
8. Dependency direction and the workflow/automation one-way edge (Section 5; 09 §2).
9. Deterministic, no-hidden-scoring rules (06 §9) and grounded-AI rules (07 §4).
10. Workspace scoping of search (ADR-010) and the API conventions
    (API_GUIDELINES.md: envelope, versioning, cursor pagination, error shape).

## 11. Out of Scope (later phases)

- Concrete implementation: code, DTOs, controllers, services, and the NestJS/Prisma
  wiring of these modules (implementation phase).
- Schema reconciliation of C1 (ADR-006 vs N:M contact-method ownership) and schema
  extensions for rating evidence, enrichment attributes, insight store, and the query
  read model (schema workstream; see Section 12).
- Streaming transport selection (SSE vs WebSocket) and per-stream authz/rate-limit
  enforcement details (implementation of 08 §4).
- Matching rule tuning, score weights/thresholds, enrichment tier assignment rules, and
  rating-evidence thresholds (configuration, authored after implementation begins).
- Provider SDK (01 §7), operational runbooks, and per-provider budget configuration.

## 12. Implementation Checklist (required before production code)

Before writing production code, all of the following must be resolved:

1. **Schema reconciliation (C1)** — ADR-006 vs schema N:M contact-method ownership;
   the schema is the operative model (04 §12). Must be closed by the schema workstream.
2. **Canonical rating evidence** — a canonical home for Google Rating/Review Count/Last
   Review (03 §3, 06 §3) in schema and Unified Model (V3).
3. **Enrichment attribute persistence** — storage contract for CRM/Automation/Booking/
   Employees/Revenue enrichment attributes (05 §7, V4).
4. **AI insight store** — persistence + retention for versioned, evidence-cited insights
   (07, V2).
5. **Query read model** — the search module's indexed read surface that Advanced Search
   filters and history resolve against (08 §7, V1/P1).
6. **Search history schema** — recent/saved/pinned/templates persistence (08 §7, V5).
7. **Streaming controls** — stream authz, rate limiting, reconnect-token TTL,
   transport selection (08 §4, SEC1).
8. **PII/compliance policy** — retention, redaction, and suppression for contact
   methods, WHOIS, and employment evidence (SEC2).
9. **Operational runbooks** — dead-letter re-drive, alerting thresholds, enrichment
   capacity model (02 §6, O1/O2).
10. **Module dependency enforcement** — the module graph in 09 §2 enforced by the
    project's dependency rules/tooling before feature work begins.

## 13. Freeze Declaration

As of this document, the **Sales Intelligence Architecture is frozen at v1.0**. The
documents 01-provider-architecture.md … 10-search-validation.md, together with this
freeze and its referenced canonical documents (MASTER_ARCHITECTURE.md, DATABASE DESIGN
FREEZE v1.0, API_GUIDELINES.md), constitute the official reference.

- Future architectural changes require an **ADR** (adr/), reviewed against this freeze.
- Non-architectural implementation (Section 11) does not require an ADR but must not
  violate Section 10.
- The validation report (10) recorded no finding requiring architecture change; all
  findings are implementation prerequisites (Section 12) or out-of-scope items
  (Section 11).
- No change to this document occurs without a new ADR and a version bump
  (v1.0 → v1.1 …).

**Sales Intelligence is Ready for Implementation**, contingent on the implementation
checklist (Section 12).

# 09 — Module Boundaries

Status: Draft v1.0 (Phase 5.5)
Cross-referenced by: 01-provider-architecture.md … 08-search-api.md, MASTER_ARCHITECTURE.md §8, API_GUIDELINES.md, ADR-010

## 1. Purpose

This document fixes the **final module architecture** for Sales Intelligence: what each
module owns, what it must never own, what it exposes, its internal shape, and its
allowed/forbidden dependencies. It is the module-level law the pipeline stages
(02-search-pipeline.md), engines (05, 06), AI (07), and API (08) are implemented within.

## 2. Dependency Model (read first)

Dependencies follow one direction — **downstream along the pipeline data flow**, with
the workflow/automation layer consuming events and issuing commands only:

```
search → provider → normalization → matching → enrichment → verification
      → data-quality → opportunity → ai-insights → crm-integration
```

Three foundational modules — `common`, `database`, `auth` — are depended upon by
everyone and depend on nothing domain-level. `workflow`/`automation` orchestrate by
**consuming events** and **issuing commands through public interfaces**; no domain module
may call `workflow` or `automation` (that is what prevents cycles).

| Dependency | Allowed for | Never for |
|---|---|---|
| common, database, auth | all modules | — |
| Any module earlier in the flow (read its inputs) | each downstream module | — |
| workflow / automation | workflow, automation | every domain module |

---

## 3. Modules

### 3.1 search

- **Responsibility**: owns the Search Builder (03), Search Job/Execution machinery
  (04/06), the Search API (08), plan validation, streaming, and search history.
- **Does NOT own**: provider collection (provider); normalization; matching; merge;
  enrichment; verification; quality; opportunity; AI insight generation; CRM export.
  It triggers collection and emits events; everything after is other modules.
- **Public Interface**: job/execution management, plan validation, stream gateway,
  history/result endpoints (08). Internal repository access through `database`.
- **Internal Components**: builder, plan validator, job manager, execution orchestrator,
  stream gateway, history store, **query read model** (the filtered-result surface that
  Advanced Search filters, 03 §3, resolve against).
- **Allowed Dependencies**: common, database, auth, provider (routing only).
- **Forbidden Dependencies**: normalization, matching, enrichment, verification,
  data-quality, opportunity, ai-insights, crm-integration, workflow, automation. The
  search module never calls the stages that consume its output.
- **Events**: produced — execution lifecycle, plan validated, history recorded.
  Consumed — none upstream (it is the entry point).
- **Future Extraction**: could become a standalone Search Service exposing the API (08)
  and emitting execution events, with the read model as its own index.

### 3.2 provider

- **Responsibility**: owns the Provider Architecture (01): registry, routing, health,
  priority, fallback, retry, plugin isolation.
- **Does NOT own**: collection *intent* (search); normalization; any business logic.
  Collect-only (01 §6).
- **Public Interface**: register/discover/invoke providers, health/status, routing
  decisions (01 §3–4).
- **Internal Components**: registry, capability catalog, health tracker, routing engine,
  plugin adapters (01 §4, §7).
- **Allowed Dependencies**: common, database, auth.
- **Forbidden Dependencies**: normalization, matching, enrichment, verification,
  opportunity, ai-insights, workflow, automation. A provider never knows another module.
- **Events**: produced — provider outcomes, health changes, routing decisions.
  Consumed — execution requests from search.
- **Future Extraction**: could become a standalone Connector/Gateway service behind a
  single contract (01 §3), the exact future-SDK boundary (01 §7).

### 3.3 normalization

- **Responsibility**: maps provider output onto the Unified Model (04 §7): canonical
  shapes for company, person, website, contact method, social profile, address; raw
  import capture (05-raw-import.md).
- **Does NOT own**: collection; interpretation; verification; matching decisions.
  Lossless and never overwriting (04 §7).
- **Public Interface**: normalized candidates + Raw Imports with ownership blocks
  (05 §7).
- **Internal Components**: mapping rules, canonicalizers per entity, raw-import writer.
- **Allowed Dependencies**: common, database, auth.
- **Forbidden Dependencies**: provider (never collects), matching, enrichment,
  verification, opportunity, ai-insights, workflow.
- **Events**: produced — imports captured, candidates emitted. Consumed — search
  execution results/events.
- **Future Extraction**: could become a Stream Normalizer service in a data-mesh.

### 3.4 matching

- **Responsibility**: duplicate detection producing advisory Duplicate Candidates (07);
  never merges, never mutates (02 §2.4).
- **Does NOT own**: merge decisions (users decide); scoring (opportunity); any writes
  to subjects.
- **Public Interface**: match candidates, duplicate-candidate lifecycle.
- **Internal Components**: match rules, candidate detector, confidence scoring.
- **Allowed Dependencies**: common, database, auth, normalization (reads canonical
  candidates).
- **Forbidden Dependencies**: enrichment, verification, opportunity, ai-insights,
  provider, workflow.
- **Events**: produced — duplicate candidate created/decided/expired. Consumed —
  normalized candidates.
- **Future Extraction**: could become an Identity Resolution service.

### 3.5 enrichment

- **Responsibility**: owns the Enrichment Engine (05): enrichment plans, incremental
  enrichment, attribute ownership, plugin orchestration. Collection goes through the
  provider registry (02 §2.6 reconciliation); derivation consumes collected evidence.
- **Does NOT own**: verification (never stamps "verified", 05 §1); scoring; collection
  intent; direct provider calls.
- **Public Interface**: enrichment plans, owned attributes (05 §7), enrichment events.
- **Internal Components**: plan composer, priority tiering, plugin orchestrator,
  attribute ownership store.
- **Allowed Dependencies**: common, database, auth, provider (routing), normalization.
- **Forbidden Dependencies**: verification, opportunity, ai-insights, workflow, search
  (never creates jobs). Enrichment never calls verification or scores anything.
- **Events**: produced — enrichment plan run, attribute computed, import captured.
  Consumed — subject resolved (matching), provider outcomes.
- **Future Extraction**: could become an Enrichment Service consumed via the provider
  contract.

### 3.6 verification

- **Responsibility**: owns Verification Records (08): confirm/not-confirm/inconclusive,
  validity windows; the only activity that elevates evidence to fact (05 §1).
- **Does NOT own**: enrichment; collection; subject edits (08 never edits the subject);
  AI decisions.
- **Public Interface**: verification records, verify/subject/attribute requests.
- **Internal Components**: verification policy engine, record store.
- **Allowed Dependencies**: common, database, auth, normalization, enrichment.
- **Forbidden Dependencies**: opportunity, ai-insights (AI never confirms, 07 §7),
  search, provider, workflow.
- **Events**: produced — record verified, record expired. Consumed — owned attributes
  from enrichment.
- **Future Extraction**: could become a Verification service.

### 3.7 data-quality

- **Responsibility**: owns Data Quality Records (09): computed → valid → superseded
  snapshots; evidence-derived only, never edits source (02 §2.8).
- **Does NOT own**: quality fixes; subject writes; opportunity scoring; AI judgment.
- **Public Interface**: quality records, quality signals (completeness, freshness,
  verifiability, conflict).
- **Internal Components**: quality policy engine, snapshot store.
- **Allowed Dependencies**: common, database, auth, normalization, enrichment,
  verification.
- **Forbidden Dependencies**: opportunity, ai-insights, search, provider, workflow.
- **Events**: produced — quality record computed/superseded. Consumed — verification
  records and attribute ownership.
- **Future Extraction**: could become a Quality/DQM service.

### 3.8 opportunity

- **Responsibility**: owns the Opportunity Engine (06): scoring, signals,
  recommendations, priority bands, score history. Produces scored, explained
  opportunities from verified, quality-scored intelligence (02 §2.9).
- **Does NOT own**: collection, enrichment, verification, AI (06 §8 — opportunity is
  produced before AI).
- **Public Interface**: opportunity records, scores, recommendations, priority, history.
- **Internal Components**: score configuration (versioned), signal ingestion,
  recommendation mapper, band classifier, score history store.
- **Allowed Dependencies**: common, database, auth, normalization, matching, enrichment,
  verification, data-quality.
- **Forbidden Dependencies**: ai-insights (AI consumes opportunity, never the reverse),
  search, provider, workflow, crm-integration.
- **Events**: produced — score computed/recalculated, band changed, recommendation set
  changed, override recorded. Consumed — verified/quality evidence.
- **Future Extraction**: could become a Scoring/Sales-Readiness service.

### 3.9 ai-insights

- **Responsibility**: owns the AI Insights Engine (07): insight types/packs, grounding,
  explainability, prompt layer, safety boundaries. Consumes opportunity and evidence;
  proposes, never executes (02 §2.10).
- **Does NOT own**: data collection, verification, scoring, priority, merge decisions,
  execution control, or any write to the canonical model (07 §1).
- **Public Interface**: insight records, insight packs, evidence citations, template
  versions.
- **Internal Components**: insight-type registry, pack composer, grounding validator,
  prompt layer (templates + governance, 07 §6), insight output store, safety gates.
- **Allowed Dependencies**: common, database, auth, normalization, enrichment,
  verification, data-quality, opportunity (read-only).
- **Forbidden Dependencies**: search, provider (never creates/cancels executions, 06 §12),
  crm-integration, workflow (may emit suggestions to workflow, never be called by it
  as an executor of decisions).
- **Events**: produced — insight produced, suggestion emitted. Consumed — opportunity,
  quality, verification events.
- **Future Extraction**: could become an Insights service; the prompt layer would be its
  governance boundary.

### 3.10 workflow

- **Responsibility**: owns workflow definition/execution separation (10-workflow.md):
  subscribes to domain events, runs workflows, requests retries/verification/cancellation
  through public interfaces.
- **Does NOT own**: domain logic; decisions that belong to users; model execution.
  It orchestrates, never decides facts (07 §7 human review).
- **Public Interface**: workflow definitions, workflow runs, command issuance to
  modules.
- **Internal Components**: definition store, event subscription, runner, command
  dispatcher.
- **Allowed Dependencies**: common, database, auth, and **public interfaces** of
  search/opportunity/verification/enrichment/crm-integration (to issue commands and
  subscribe to events).
- **Forbidden Dependencies**: provider, matching, normalization internals; no domain
  module may depend on workflow (reverse edge is forbidden — it creates cycles).
- **Events**: produced — workflow lifecycle, retry/verification/cancellation requests.
  Consumed — all domain events it subscribes to.
- **Future Extraction**: could become a Workflow/Orchestration service (or delegate to
  a workflow engine) without touching domain modules.

### 3.11 automation

- **Responsibility**: owns Automation Jobs (11-automation-job.md): schedules and drives
  the same stage graph as manual flow; scheduled searches (03 §5), re-enrichment cadence
  (05 §5), recurring exports.
- **Does NOT own**: workflow decisions, scoring, verification, AI-generated schedules
  (AI proposes, automation executes only authorized schedules, 06 §12).
- **Public Interface**: automation jobs, schedules, run history.
- **Internal Components**: schedule store, trigger dispatcher, run recorder.
- **Allowed Dependencies**: common, database, auth, and public interfaces of search
  (schedule executions), workflow (drive runs).
- **Forbidden Dependencies**: all domain internals; no domain module calls automation.
- **Events**: produced — schedule fired, run started/completed. Consumed — events that
  conditionally suppress/reschedule.
- **Future Extraction**: could become a Scheduler service.

### 3.12 crm-integration

- **Responsibility**: owns CRM export (02 §2.11): maps opportunities/leads to external
  CRM contracts, emits export events, tracks sync state. Internal record is always the
  source of truth.
- **Does NOT own**: opportunity generation, verification, unverified-data export.
- **Public Interface**: export runs, sync state, export events.
- **Internal Components**: mapper, sync tracker, export runner.
- **Allowed Dependencies**: common, database, auth, opportunity.
- **Forbidden Dependencies**: search, provider, matching, enrichment, verification,
  ai-insights, workflow.
- **Events**: produced — exported/export-failed. Consumed — opportunity created/advanced.
- **Future Extraction**: could become an Integration service (or use a vendor's
  connector) with the same contract.

### 3.13 common

- **Responsibility**: shared kernel: domain events, identifiers, correlation,
  errors, time, pagination, and the invariants both docs (API_GUIDELINES) and modules
  rely on. The only place cross-cutting conventions live.
- **Does NOT own**: business logic, data, or any domain responsibility.
- **Public Interface**: event bus/contracts, id/correlation primitives, error types,
  pagination primitives.
- **Internal Components**: event contracts, shared primitives, validation helpers.
- **Allowed Dependencies**: none (or language-level utilities only).
- **Forbidden Dependencies**: every other module. Nothing may be imported by common from
  a domain module.
- **Events**: produced/consumed — the event contracts it defines (transit only, no
  logic).
- **Future Extraction**: split per shared-kernel conventions (event schema package,
  primitive package); it is already a dependency-only kernel.

### 3.14 auth

- **Responsibility**: identity, roles, permissions, workspace scoping (12-role.md,
  13-permission.md, 14-workspace.md; ADR-010). Enforces ownership on every public
  interface.
- **Does NOT own**: domain data, workflow decisions, any sales logic.
- **Public Interface**: identity, authorization checks, workspace scope resolution.
- **Internal Components**: user/role/permission model, scope resolver, guard logic.
- **Allowed Dependencies**: common, database.
- **Forbidden Dependencies**: every domain module. Domain modules depend on auth, never
  the reverse.
- **Events**: produced — authorization-relevant changes (role assigned, workspace
  changed). Consumed — none domain.
- **Future Extraction**: could become an Auth/Identity service (OIDC-compatible)
  without domain changes.

### 3.15 database

- **Responsibility**: the implemented schema (prisma/schema.prisma), migrations, and
  repository/data-access layer. The sole owner of persistence mechanics.
- **Does NOT own**: domain rules, events, or any business behavior. Repositories expose
  persistence, never pipeline logic.
- **Public Interface**: repositories/data-access contracts consumed by modules.
- **Internal Components**: schema, migrations, repositories, seeding.
- **Allowed Dependencies**: common (types) only.
- **Forbidden Dependencies**: every domain module; no module logic lives in the
  database layer.
- **Events**: produced/consumed — none (persistence is silent; events are common's job).
- **Future Extraction**: unchanged by extraction of any domain module; repositories
  become per-service data access.

## 4. Cross-Module Rules

1. **Dependency direction is enforced** — modules depend only on common/database/auth
   and earlier modules; the workflow/automation edge is one-way (command/event).
2. **No domain module calls workflow or automation**; they orchestrate via events and
   public interfaces only.
3. **Ownership is exclusive** — each responsibility lives in exactly one module
   (Section 3 "Does NOT own" clauses are as binding as the ownership clauses).
4. **Events are the only cross-module coupling beyond allowed dependencies** — modules
   never read another module's internal state directly (02 §8, MASTER §8).
5. **AI boundaries are module boundaries** — ai-insights has read-only access to its
   inputs and no access to execution control (07 §7).

## Related Review Decisions

- Consolidates the module view of 01–08 into one enforceable boundary model.
- Dependency rules are the implementation-time guarantee of 02 §8 (no circular
  dependencies, one responsibility each).
- Validated by 10-search-validation.md (Phase 5.5).
- Frozen by SALES_INTELLIGENCE_ARCHITECTURE_FREEZE_v1.0.md (Phase 5.5).

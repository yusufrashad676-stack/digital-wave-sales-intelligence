# 01 — Provider Architecture

Status: Draft v1.0 (Phase 5.1)
Cross-referenced by: MASTER_ARCHITECTURE.md §3 (Search → Raw Import), 02-search-pipeline.md, 03-import-source.md, 04-search-job.md, 06-search-execution.md, ADR-010, DATABASE_REVIEW.md B1

## 1. Vision

A **Provider** is a named, self-contained capability that collects raw external data
for the intelligence system. Providers exist because the system must gather evidence
from many independent external systems — search engines, maps, directories, social
platforms, websites, technology indexes, email headers, government registries — none
of which share a common interface, contract, or reliability profile.

Providers exist for three reasons:

1. **Uniformity**: every external system is wrapped behind one consistent interaction
   contract, so the rest of the pipeline never sees an external API.
2. **Isolation**: a failure, a rate limit, or a breaking change in one external system
   can never take down collection from another, nor corrupt shared state.
3. **Extensibility**: adding a new data source must be additive — register a provider —
   never a change to the pipeline, the matching logic, or the database.

A Provider is **collect-only**. It acquires raw evidence and hands it to the pipeline.
It never classifies, scores, enriches, or resolves records; those responsibilities
belong to later stages (see 02-search-pipeline.md).

## 2. Provider Categories

Providers are grouped by the nature of the external system they wrap. The category
defines the typical contract shape and data characteristics, not a fixed behavior.

| Category | Description | Typical output |
|---|---|---|
| Search | General web/keyword search engines. | Ranked result lists with titles, snippets, URLs, publication metadata. |
| Maps | Geospatial and place lookup services. | Addresses, coordinates (see ADR-008: plain lat/lng), place identifiers. |
| Business Directories | Curated business/company listings. | Company profile fields, contact-method entries, category tags. |
| Social Platforms | Social/professional network profiles. | Profile pages, people attributes, relationship signals (see ADR-006: contact-method ownership is the schema's N:M joins). |
| Website | Direct scraping of a subject's own web property. | Pages, structured data embedded in pages, contact pages. |
| Email | Email-header and communication-metadata sources. | Header-derived attributes, domains, sender/recipient evidence. |
| Technology | Technology/stack detection and employment indexes. | Technology fingerprints, skills, employment records (see ADR-009). |
| Government | Public registries and statutory databases. | Registered-entity facts, filings, licensing data. |
| Future Custom | User-defined or niche sources added later. | Any shape the provider registers via its capability contract. |

The category is advisory metadata on the Import Source (see 03-import-source.md §3),
not a closed enum: the vocabulary is extensible so new categories do not require schema
or pipeline changes.

## 3. Provider Interface

Every provider — regardless of category — exposes the same logical interface. This
document describes the contract; the concrete binding (HTTP API, SDK, adapter) is an
implementation detail that must not change the semantics below.

### 3.1 Input

- A **request**: the query the caller wants resolved (keywords, subject identifier,
  location, filters).
- A **capability context**: which capabilities are being invoked and any capability
  scoping (see 3.3).
- A **budget**: the time and volume bound for this invocation (per-attempt; see
  06-search-execution.md timeoutPolicy).

### 3.2 Output

- A **result set**: candidate records in the provider's native granularity, each with a
  stable external reference, retrieval URL, and retrieval timestamp.
- **Raw evidence**: the byte-faithful content captured (feeds Raw Import;
  05-raw-import.md).
- **Per-result provenance**: which request, category, and retrieval context produced
  each record (feeds Import Source usage on the Search Execution).
- **Outcome metadata**: success/failure, partial-success boundaries, and counters —
  never silently merged into a later run (see 06-search-execution.md §9).

### 3.3 Capabilities

A provider declares what it can do so the pipeline selects it honestly:

| Capability | Meaning |
|---|---|
| `search` | Resolve free-text/keyword queries. |
| `lookup` | Resolve a known external reference (ID, URL, domain). |
| `profile` | Fetch the full profile/record for an identifier. |
| `enumerate` | Walk an index (pages, archives, catalogs). |

Capability declarations are part of the provider's registration (Section 4) and are
how a Search Job's source selection (04-search-job.md) is validated.

### 3.4 Authentication

- Credentials and secrets never travel with requests; each provider manages its own
  secrets.
- Providers are authorized to specific workspaces via workspace-scoped Import Source
  usage (ADR-010: Search Job/Execution are workspace-scoped).
- All authentication failures surface as typed provider errors, never as generic
  failures, so the Registry can classify health accurately.
- Secrets are never logged, written into imports, or exposed through the interface
  (SECURITY.md).

### 3.5 Health

- Every provider reports a health state through the Registry: `healthy`, `degraded`,
  `unhealthy`, `unknown` (Section 4.4).
- Health is derived from recent real invocations, not synthetic pings, so it reflects
  what the pipeline would actually experience.
- Health state feeds routing: degraded/unhealthy providers are deprioritized or skipped
  in fallback order.

### 3.6 Versioning

- Each provider registration carries a contract version.
- Version changes are recorded (additive changes are non-breaking; removal of a
  capability is breaking and triggers a Registry review of dependent Search Jobs).
- Raw evidence always records which provider version produced it, so historical imports
  remain explainable even after the provider contract evolves (05-raw-import.md).

## 4. Provider Registry

The **Provider Registry** is the system's knowledge of every provider and its health.
It is the single routing layer that translates a pipeline request into the concrete
providers to invoke. It is catalog data, not business logic.

### 4.1 Registration

- A provider is registered with: identifier, category, declared capabilities (3.3),
  contract version (3.6), auth scope, fallback/retry policy, and routing priority.
- Registration is additive and reviewed; it never modifies pipeline code or schema.
- Registration is what makes an Import Source referenceable as a `providerReference`
  (03-import-source.md): the pipeline can only route to registered providers.

### 4.2 Discovery

- Search Jobs and the pipeline discover providers **through the Registry only** — never
  by direct external calls.
- Discovery returns providers whose registered capabilities satisfy the request and
  whose workspace scope includes the requester.
- Discovery is deterministic: identical requests resolve to the same ordered candidate
  list, so routing decisions are reproducible and auditable.

### 4.3 Enable / Disable

- Providers can be enabled or disabled at the Registry level or per workspace.
- Disabling is an operational action, not an unregistration; the registration and its
  history remain.
- A disabled provider is never routed to; dependent Search Jobs surface a clear
  "source unavailable" state rather than a silent failure.

### 4.4 Health Tracking

- The Registry records each provider's current health, last checked time, and recent
  error categories.
- Degradation and recovery are recorded so routing behavior is explainable and
  retry/fallback decisions are auditable.

### 4.5 Priority, Fallback, Retry

- **Priority**: providers of the same category carry an ordering used when a job does
  not require a specific provider.
- **Fallback**: if a higher-priority provider fails, the Registry offers the next
  eligible provider in order; fallback is a routing concern, not a retry concern.
- **Retry**: retrying a provider is bounded by the provider's retry policy and happens
  **within an attempt** (a new Search Execution is a new attempt — see 06-search-job;
  the execution/job split keeps retry and routing separate).
- Every routing decision (chosen provider, fallback chain, retry count) is recorded on
  the Search Execution's metrics for audit (06-search-execution.md §4).

## 5. Provider Lifecycle

Providers move through explicit, observable states. The lifecycle below is architectural;
its persistence is a Registry concern, not a new database entity in this phase.

```
registration → initialization → execution → healthy (repeatable)
                                      ↘ failure → retry → execution
                                      ↘ degraded → recovery → execution
deprecation ← (any active state)      ↘ permanent failure → deprecation
replacement → new registration, then retirement of the old provider
```

| Stage | Meaning |
|---|---|
| Registration | Provider known to the Registry with capabilities, version, policy, scope. |
| Initialization | Credentials validated, capability contract confirmed, health baseline set. |
| Execution | Invoked by a Search Execution for actual collection (06-search-execution.md). |
| Retry | Bounded re-invocation within the attempt per the provider's retry policy. |
| Failure | Unrecoverable error for this invocation; recorded with category, never silent. |
| Recovery | Provider returns to healthy; health tracking records the transition. |
| Deprecation | Provider scheduled for removal; new routing stops, existing imports stay explainable. |
| Replacement | Successor provider registered; dependent jobs re-pointed; old provider retired. |

Rules:

- A provider that fails permanently is **deprecated**, never silently dropped.
- Deprecation preserves history: imports and executions that referenced the old
  provider must remain fully explainable (05-raw-import.md integrity, 06 §9).
- Replacement is additive first: the successor registers and proves health before the
  predecessor is retired.

## 6. Principles

1. **Isolation** — no provider can affect another provider's collection, state, or
   outcome. A failing external system degrades only its own category, never the pipeline.
2. **No provider knows another** — providers never call, reference, or depend on other
   providers. The Registry is the only thing that knows all of them.
3. **No business logic inside** — providers do not classify, match, merge, verify, or
   score. They collect raw evidence and stop. All interpretation belongs to later
   pipeline stages (02-search-pipeline.md).
4. **Collect-only** — providers never write to business entities, never mutate imported
   evidence, and never resolve duplicates. Raw evidence is immutable once captured
   (05-raw-import.md).
5. **Uniform contract** — every provider presents the same interface (Section 3);
   heterogeneity of the outside world is absorbed at the boundary and never leaks into
   the pipeline.
6. **Evidence over truth** — provider output is candidate evidence, not verified fact.
   Only Verification Records can confirm or reject attributes
   (08-verification-record.md).
7. **Additive evolution** — new sources, categories, and capabilities are additive via
   registration; they must never require changes to the pipeline, schema, or matching
   logic.
8. **Explainable routing** — every provider choice, fallback, and retry is recorded, so
   any collected record can be traced to its provider, attempt, and policy.

## 7. Future SDK

A future Provider SDK will package Section 3's contract as a reusable adapter kit so
third-party and custom providers can be built consistently:

- **Adapter skeleton** implementing the uniform interface (3.1–3.6).
- **Contract validation** so a new provider proves its capability declaration before
  registration.
- **Retry/backoff/health primitives** shared across providers, so policies behave
  uniformly even when implementations differ.
- **Evidence capture helpers** producing byte-faithful, integrity-fingerprinted raw
  evidence compatible with 05-raw-import.md.

The SDK is deliberately deferred: it must not precede the interface, and the interface
must first be proven by the built-in categories in Section 2. The SDK is a packaging of
Section 3, never a source of new business logic.

## Related Review Decisions

- Implements the MASTER_ARCHITECTURE.md §3 "Search → Raw Import" boundary as the
  provider layer.
- Aligns with ADR-010: workspace-scoped Search Job/Execution; Import Source carries the
  `providerReference` (03-import-source.md).
- Feeds 02-search-pipeline.md: the Provider layer is stage 2 of the pipeline.
- Complements 06-search-execution.md: the execution invokes providers through the
  Registry; routing/retry policy lives with the provider, attempt semantics live with
  the execution.
- Consistent with 05-raw-import.md: provider output becomes immutable raw evidence.

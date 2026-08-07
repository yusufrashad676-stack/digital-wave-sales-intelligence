# 10 — Search Validation

Status: Draft v1.0 (Phase 5.5)
Type: Review report — findings only. No architecture is modified by this document.
Scope: validates 01-provider-architecture.md … 09-module-boundaries.md.

## 1. Purpose

This document reviews the entire Sales Intelligence architecture (Phases 5.1–5.5) and
reports findings — missing modules, gaps, coupling, cycles, and risks across
scalability, security, performance, operations, and migration. It does **not** change
the architecture; it feeds the Architecture Freeze's implementation checklist.

## 2. Areas Validated

| Area | Reference | Result |
|---|---|---|
| Provider Architecture | 01 | PASS (no blocking findings) |
| Search Pipeline | 02 | PASS |
| Search Builder | 03 | PASS |
| Unified Search Model | 04 | PASS with findings (M1, V3) |
| Enrichment | 05 | PASS with findings (C1, V4) |
| Opportunity | 06 | PASS |
| AI Insights | 07 | PASS |
| Search API | 08 | PASS with findings (SEC1) |
| Module Boundaries | 09 | PASS (no cycles) |

## 3. Findings

Severity: HIGH (blocks implementation as-is), MEDIUM (needs explicit design before or
during implementation), LOW (needs policy/runbook).

### 3.1 Missing modules / components

| ID | Severity | Finding |
|---|---|---|
| V1 | HIGH | **Query read model / search index is not explicitly specified.** Advanced Search filters (03 §3: Google Rating, Review Count, Verified Only, Technologies, …) and history (08 §7) must resolve against an indexed read model; the docs define the API (08) and canonical model (04) but not the indexing/query surface. 09 places it as an internal component of `search`; its design (projection, indexing, refresh) must be a mandatory implementation prerequisite. |
| V2 | HIGH | **AI insight persistence is not specified.** Insights (07) are auditable and versioned by design (template version, evidence, model version) but no insight-store persistence contract/retention is defined. 09 lists it as an internal component of `ai-insights`; the storage/retention contract is an implementation prerequisite. |
| V3 | MEDIUM | **Rating/review evidence has no canonical home.** Google Rating, Review Count, Last Review (03 §3) and the Reviews signal (06 §3) depend on rating evidence; 04 defines no canonical rating entity/attribute. Schema workstream must add rating evidence before these filters/signals can be truth. |
| V4 | MEDIUM | **Enrichment attributes (CRM, Automation, Booking, Employees, Revenue) have no persistence contract.** Attribute ownership (05 §7) is defined; the storage shape for enrichment attributes is not. Schema workstream required. |
| V5 | LOW | Search history (recent/saved/pinned/templates) has no schema/retention contract (08 §7). |

### 3.2 Coupling

| ID | Severity | Finding |
|---|---|---|
| C1 | MEDIUM | **Enrichment ↔ provider overlap.** Enrichment orchestrates provider collection through the Provider Registry (02 §2.6 reconciliation, 05 §2–3). Risk: enrichment drifting into a second search engine. Mitigated by 09 (enrichment routes through `provider`, never owns search jobs); must be guarded at implementation. |
| C2 | LOW | **workflow event surface is broad.** `workflow` subscribes to most domain events; risk of becoming a god-module. 09 constrains it to commands + events; monitor fan-in at implementation. |

### 3.3 Cyclic dependencies

| ID | Severity | Finding |
|---|---|---|
| D1 | — | **None found in the module graph.** Dependency direction is one-way downstream (09 §2); workflow/automation are consumed-by, never depended-upon; ai-insights reads opportunity while opportunity never reads ai-insights. The graph is acyclic as specified. |

### 3.4 Scalability risks

| ID | Severity | Finding |
|---|---|---|
| S1 | MEDIUM | Per-job execution serialization (06 §3) bounds a single job's throughput by design. A job spanning many sources runs its sources serially; scale-out will need per-source execution partitioning (future), not documented as a constraint. |
| S2 | MEDIUM | Matching is online per candidate during streaming (02 §4). High-volume runs put latency pressure on matching; rule tuning/batching must be designed, not deferred. |
| S3 | LOW | Provider rate limits are shared across workspaces; priority tiers (05 §6) mitigate, but per-provider budget configuration is not specified. |

### 3.5 Security risks

| ID | Severity | Finding |
|---|---|---|
| SEC1 | HIGH | **Streaming API adds attack surface.** Streams (08 §4): authorization per stream, per-stream rate limiting (429), heartbeat/reconnect token expiry, and replay access must be explicitly enforced. Deferred transport choice (SSE/WebSocket) must include these controls. |
| SEC2 | MEDIUM | **PII exposure.** Emails, phones, WHOIS, and employment data are collected and retained (05 §7, 04 §12). Suppression exists for person contact methods, but enrichment evidence retention/redaction/compliance policy is not specified. |
| SEC3 | LOW | Prompt injection is structurally mitigated (07 §7 data/instruction channel quarantine); enforcement at implementation is mandatory, not optional. |

### 3.6 Performance risks

| ID | Severity | Finding |
|---|---|---|
| P1 | MEDIUM | Advanced Search filters against canonical data require the read model (V1); without it, filters degrade to scans. V1 is therefore also a performance prerequisite. |
| P2 | LOW | Stream replay (08 §4.6) is bounded by execution retention (06 §11); reconnect tokens need TTL (deferred). |

### 3.7 Operational risks

| ID | Severity | Finding |
|---|---|---|
| O1 | MEDIUM | Provider health/retry observability is defined (01, 06) but operational runbooks — dead-letter re-drive (02 §6), alerting thresholds, enrichment capacity — are not. |
| O2 | LOW | No capacity model for enrichment tier scheduling (05 §6); needs monitoring + tuning at implementation. |

### 3.8 Future migration risks

| ID | Severity | Finding |
|---|---|---|
| M1 | HIGH | **C1 unresolved: ADR-006 vs schema N:M contact-method ownership** (04 §12, recorded in Phase 5.2/5.3 reports). The Unified Model follows the schema; the schema workstream must reconcile before implementation. |
| M2 | MEDIUM | Schema extensions required before implementation: rating evidence (V3), enrichment attributes (V4), insight store (V2), read model (V1). |
| M3 | LOW | API versioning (API_GUIDELINES) and streaming transport must be settled before client work. |

## 4. Conclusion

- **Module boundaries are sound and acyclic** (09). No missing top-level module: the
  "missing" items (V1–V5) are internal components and persistence contracts within the
  frozen module list, not new modules.
- **No architecture redesign is required.** Every HIGH finding is an implementation
  prerequisite or a schema-workstream item — none contradicts the approved design.
- The single known architecture conflict (C1, M1) predates this phase and is tracked,
  not introduced here.

## 5. Scores

Re-evaluated (Phase 5.5 review): scores measure the **architecture itself**; items
intentionally deferred to implementation, configuration, operations, or the schema
workstream are **not** architecture deductions (Sections 3–4, Freeze §11). They are
reported below as prerequisites, not penalties.

| Score | Value | Basis |
|---|---|---|
| **Architecture Readiness** | **9.8 / 10** | Complete, coherent, acyclic module graph; no design contradictions and no missing top-level modules. The only sliver (−0.2) is documentation depth: the query read model and AI insight store are specified at component-boundary level (09 §3.1, §3.9) rather than as formal contract sections — a documentation nuance, not a design gap. |
| **Implementation Readiness** | **7.0 / 10** | Blocked by implementation prerequisites: schema reconciliation (M1), rating/enrichment attribute persistence + insight store + read model (V1–V4). None are redesigns, but all must precede production code. This score is separate from Architecture Readiness and intentionally lower. |
| **Documentation Completeness** | **9.0 / 10** | 01–10 cover the mandated surface; residual gaps are the persistence/runbook contracts above. |

## Related Review Decisions

- Findings feed the Implementation Checklist in SALES_INTELLIGENCE_ARCHITECTURE_FREEZE_v1.0.md.
- No previous document was modified by this review (Phase 5.5 instruction: report only).

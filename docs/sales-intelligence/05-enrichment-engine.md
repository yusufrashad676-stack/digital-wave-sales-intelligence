# 05 — Enrichment Engine

Status: Draft v1.0 (Phase 5.3)
Cross-referenced by: MASTER_ARCHITECTURE.md §3, 01-provider-architecture.md, 02-search-pipeline.md §2.6, 04-unified-search-model.md, 03-import-source.md, 05-raw-import.md, 06-search-execution.md, 07-duplicate-candidate.md, 08-verification-record.md, 09-data-quality-record.md

## 1. Vision

Enrichment exists because a **found identity is not a sales decision**. A company record
with a name, address, and category tells you the company exists; it does not tell you
whether it is a good account, what it runs its business on, who to reach, or whether it
is likely to buy. Enrichment widens and deepens the canonical record (04) so that
opportunity decisions (06) have the evidence they need.

The three activities are deliberately separate:

| Activity | What it does | What it must never do |
|---|---|---|
| **Data Collection** | Acquires raw evidence from the outside world through providers (01, 02 §2.1–2.2). | Interpret, verify, or trust anything. Collection is capture. |
| **Enrichment** | Adds derived and supplementary attributes to a subject by orchestrating enrichment providers and computing derived values (02 §2.6). | Assert truth. Enrichment is value, not verdict. |
| **Verification** | Confirms or rejects attributes against evidence of required strength; produces immutable Verification Records (02 §2.7, 08). | Guess, derive, or fabricate. Verification is the only activity that elevates evidence to fact. |

Enrichment is the middle layer: it makes the record **deeper** (more attributes) and
**wider** (more dimensions), while Verification makes it **trusted**. The pipeline
distinguishes them so that an enriched-but-unverified attribute is visible as candidate
value, never silently presented as fact.

## 2. Enrichment Pipeline

The enrichment flow is an ordered orchestration of enrichment providers and derivation.
It is a **plan for a subject**, not a search of the whole market:

```
Company
  ↓
Website
  ↓
Social Networks
  ↓
Business Information
  ↓
Technology Stack
  ↓
Emails
  ↓
Additional Attributes
```

| Step | Produces | Notes |
|---|---|---|
| Company | Confirms/corrects the canonical Company identity, legal identity, structure (branches). | Entry gate: enrichment only runs on resolved identities (post-matching/merge, 02 §2.4–2.5). |
| Website | Canonical Website: domain, pages, contact-page leads, technology hints. | Domain is the pivot that unlocks social and tech steps (04 §4). |
| Social Networks | Canonical Social Profiles per platform + activity evidence. | Presence + activity signals (03 §3; 04 §6). |
| Business Information | Business attributes: category refinements, opening/booking signals, ratings snapshots. | From Google Business-style and directory providers. |
| Technology Stack | Technology evidence: frameworks, CRM/automation/booking software (03 §3 filters). | Evidence-cited enrichment (04 §4 techHints). |
| Emails | Contact-method candidates (email/phone) with suppression and verification context. | Email Discovery provider output; never asserted — candidates only (Section 7). |
| Additional Attributes | Derived and aggregate attributes (reachability, activity recency, freshness). | Derivation consumes only collected evidence (02 §2.6). |

Rules:

- Each step depends on the previous step's canonical output (Website before Social,
  Technology before Emails where discovery is domain-bound). Steps that cannot run
  (no website) degrade gracefully and never block the subject's other steps.
- Every step's output is a candidate + Raw Import (05-raw-import.md), never a direct
  write to the canonical value.
- The flow is event-driven per subject (02 §3); steps emit events (attribute computed,
  import captured) that downstream stages consume.

## 3. Enrichment Providers

Enrichment providers are **providers** (01) first: they are registered in the Provider
Registry, declare capabilities, carry their own auth/health/policy, and produce Raw
Imports like any search provider (01 §4, 02 §2.6 reconciliation). The Enrichment Engine
does not call them directly; it routes requests through the Registry.

| Provider | Capability (01 §3.3) | Typical evidence |
|---|---|---|
| Website | `lookup`, `profile`, `enumerate` | Pages, contact page, embedded structure, tech hints. |
| Google Business | `lookup` | Ratings, review count/recency, category, hours, booking. |
| Facebook | `lookup`, `profile` | Page/social profile + activity evidence. |
| Instagram | `lookup`, `profile` | Social profile + activity evidence. |
| LinkedIn | `lookup`, `profile` | Company page + people/employment signals (ADR-009 alignment). |
| WHOIS | `lookup` | Domain registration metadata (registrar, dates, registrant evidence). |
| Technology Detection | `lookup` | Technology fingerprints from website techHints (04 §4). |
| Email Discovery | `lookup` | Contact-method candidates tied to domain/identity. |

Provider-level rules:

- A provider is selected for a subject's enrichment plan **by capability + priority +
  health** (01 §4.4–4.5), exactly like search routing.
- Provider failure degrades that step only; fallback and retry follow provider policy
  within the attempt (01 §5, 06-search-execution.md §10).
- New enrichment providers are **additive registrations**, never schema or pipeline
  changes (01 §6 principle 7).

## 4. Plugin Architecture

Every enrichment provider is isolated for the same reason every provider is isolated
(01 §6): a broken or abusive source must not affect other sources, and adding a source
must never require touching the engine.

- **One provider, one plugin**: each provider is an independent unit with its own
  contract version (01 §3.6), auth, health, retry policy, and capability declaration.
  Providers do not share state, secrets, or code paths.
- **The Registry is the only coupling point**: plugins register with the Registry and
  are invoked only through it (01 §4, 02 §2.6). No plugin knows another plugin exists.
- **Plugin failure is contained**: a plugin crash, timeout, or policy violation affects
  only its own step and is recorded in the execution's metrics (06 §4).
- **No business logic in plugins**: plugins collect and return evidence; the Engine
  derives, the matcher matches, the verifier verifies (01 §6 principle 3).
- **Future extensibility**: new enrichment types are new plugins that declare their
  capabilities and evidence shape. The Unified Model (04) may gain new canonical
  attributes by additive extension; the engine, pipeline, and schema do not change to
  accommodate a new plugin (01 §6 principle 7).

## 5. Incremental Enrichment

Enrichment is never "all at once for everyone". It proceeds in escalating, individually
justified increments so cost is proportional to value.

| Mode | What runs | When |
|---|---|---|
| **Basic enrichment** | Identity-critical steps only: Company, Website, Business Information. | Every new resolved subject, as part of normal pipeline flow (02). |
| **Deep enrichment** | Full plan: Social Networks, Technology Stack, Emails, Additional Attributes. | Subjects that earn deep treatment (Section 6). |
| **Re-enrichment** | A step (or the full plan) rerun against fresh evidence. | Stale or failed steps, per subject/attribute validity windows (08). |
| **Scheduled enrichment** | Re-enrichment on a cadence, e.g., weekly/monthly per priority tier. | Subjects under active management (06 Opportunity subjects, workflows, 10/11). |
| **Priority enrichment** | Basic → deep escalation for a subject, or a cohort, ahead of the queue. | A high-priority subject enters the Opportunity pipeline (06) or an authorized workflow requests it. |

Incremental rules:

- Increments are additive; a subject's existing attributes are never re-collected
  unless a validity window (08) or a scheduled refresh demands it (04 §12).
- Every increment produces new Raw Imports and history entries; older evidence is never
  deleted or overwritten (04 §12).
- Increments are driven by events (subject created, subject escalated, verification
  expired, schedule fired), never by a synchronous blocking pass.

## 6. Priority Model

Not every company receives full enrichment. Enrichment is **costly** (provider calls,
rate limits, compute) and **asymmetric in value** — a one-person local shop does not
need a deep technology fingerprint; a mid-market SaaS prospect does. Priority decides
how deep and how fast a subject is enriched, without changing what enrichment is.

- **Tiers are computed from evidence already in the canonical record** (size signals,
  category, verified attributes, matching history), then optionally overridden by an
  authorized human or a Search Profile (03 §6).
- **Priority-based execution**: the Enrichment Engine schedules plans against provider
  budgets by tier — high-priority subjects get deep plans first and scheduled
  re-enrichment; low-priority subjects get basic plans on slack capacity.
- **Priority is a scheduling property, not a data property**: it never changes how
  evidence is collected, how values are attributed (Section 7), or how conflicts are
  resolved (Section 8). It changes only when and how deep.
- **No starvation**: every resolved subject is at least basic-enriched; priority
  affects depth and cadence, never eligibility.
- Priority decisions are recorded and explainable (which signals set the tier, who
  overrode it), consistent with 06's explainability rules.

## 7. Attribute Ownership

Every discovered attribute is owned by its evidence, not by the engine or the subject.
For every attribute, the model records:

| Property | Meaning |
|---|---|
| **Value** | The canonical attribute value (candidate until verified). |
| **Source** | Which provider(s) produced it; which Import Source and Raw Import back it (03/05); which execution collected it (06 §4 correlationId). |
| **Confidence** | A computed per-value confidence from evidence strength, agreement, and freshness (04 §10) — never a guess, never AI-produced (06 §12). |
| **Collected At** | When the evidence was captured (retrieval time, not processing time). |
| **Verified At** | When a Verification Record (08) confirmed/rejected the value; empty until then. |
| **History** | Append-only chain of values + evidence + resolutions for this attribute (04 §12). |

Rules:

- An attribute without a Source and Collected At is **not an attribute** — it cannot
  exist in the Unified Model.
- "Verified At" is set only by Verification (08). Enrichment never stamps verification;
  the pipeline's Verification stage does (02 §2.7).
- History is immutable; updating an attribute appends a new chain entry with its own
  ownership block (04 §12).
- These properties travel with the value into Opportunity (06) so every score signal is
  attributable back to a provider and an import.

## 8. Conflict Handling

Enrichment routinely produces multiple or conflicting values for the same attribute.
Conflict handling mirrors the Unified Model policy (04 §10) and never invents a winner.

- **Multiple values**: all values are retained as candidates with their ownership blocks
  (Section 7). The canonical value is the resolution, not the deletion of the rest.
- **Conflicting values**: resolved by evidence — verified values (08 `confirmed`) outrank
  unverified; among unverified, source priority (04 §11) and freshness decide.
- **Evidence drives every decision**: a resolution without cited evidence is rejected.
- **Confidence is computed**: per-value confidence (Section 7) orders candidates; ties
  and identity-critical conflicts (registration number, domain) go to manual review.
- **Manual review**: unresolved conflicts surface as review tasks with the full candidate
  set and evidence; the decision, actor, and evidence are appended to history
  (04 §10, mirroring 07 duplicate decisions).
- **Never silently overwrite**: enrichment never replaces an existing canonical value in
  place — it appends a candidate and lets resolution decide (04 §10, §12).

## 9. Design Principles

1. **Incremental** — enrichment escalates by justified increments (basic → deep →
   scheduled → priority); cost is proportional to value, and no subject is ever fully
   enriched without being earned.
2. **Evidence-driven** — every attribute, confidence, and resolution is backed by cited
   evidence (Section 7); nothing is derived from thin air.
3. **Never overwrite** — enrichment appends candidates and history; it never edits an
   existing canonical value in place (04 §12).
4. **Always preserve provenance** — source, collection time, verification time, and
   history travel with every value to Opportunity (06); a value that cannot be
   explained does not exist.
5. **Plugin-based** — all enrichment collection happens through isolated plugins routed
   by the Provider Registry (Sections 3–4); the engine, pipeline, and schema are never
   modified to add a source.

## Related Review Decisions

- Implements 02-search-pipeline.md §2.6 and reconciles it (Phase 5.3 note): enrichment
  collection routes through the Provider Registry (01 §4); attribute derivation
  consumes collected evidence only.
- Consumes the Unified Model (04 §7–12) for attribute ownership, conflict handling, and
  append-only history.
- Aligns with 08-verification-record.md (verification is separate; enrichment never
  stamps "verified"), 05-raw-import.md (all enrichment evidence is immutable),
  06-search-execution.md (per-attempt budgets, metrics, lineage).
- Feeds 06-opportunity-engine.md: enriched, owned attributes are the signals the
  Opportunity Engine scores.

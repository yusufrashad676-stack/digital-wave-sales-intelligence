# 06 — Opportunity Engine

Status: Draft v1.0 (Phase 5.3)
Cross-referenced by: MASTER_ARCHITECTURE.md §3, 02-search-pipeline.md §2.9–2.10, 03-search-builder.md, 04-unified-search-model.md, 05-enrichment-engine.md, 08-verification-record.md, 09-data-quality-record.md, GLOSSARY.md ("Engagement & Opportunity")

## 1. Vision

Opportunity exists because the platform's purpose is **actionable sales intelligence**,
not data accumulation. A Company is a fact about the world; an Opportunity is a
**decision-ready sales object** — the same company evaluated against an organization's
offer and pipeline. The Opportunity Engine turns enriched, verified, quality-scored
companies into ranked, explainable opportunities a sales team can act on.

The three concepts are distinct:

| Concept | What it is | Who creates it |
|---|---|---|
| **Company** | A real-world business identity in the Unified Model (04 §2). | The pipeline: collection, matching, merge. |
| **Lead** | The role a subject plays for a team/workspace: subject + lead metadata (GLOSSARY — "Engagement & Opportunity"). | A team/workspace, when it starts pursuing the subject. |
| **Opportunity** | A scored, explained evaluation of a subject against the organization's offer and pipeline, with priority and recommended services (02 §2.9). | The Opportunity Engine, from verified, quality-scored intelligence. |

A company may exist without being a lead; a lead may exist without being a scored
opportunity; an opportunity always points back to a company/lead and its evidence.

## 2. Opportunity Score

The Opportunity Score is the engine's output: a single comparable figure that ranks a
subject's fit and readiness. This section describes **composition, not formulas** —
weights, scales, and thresholds are configuration, versioned like the score itself
(Section 7).

- **Composition** — the score is assembled from a fixed, ordered set of **signal groups**
  (Section 3). Each group contributes a normalized sub-score; the final score is an
  explicitly configured aggregation (weighted combination) of the sub-scores.
- **No hidden inputs** — the set of signal groups, their weights, and the aggregation
  rule are published configuration. Changing them changes the score **version**
  (Section 7), never the historical record.
- **Empty is not zero** — a missing signal contributes "no evidence" rather than a low
  score, so an unknown company is not automatically penalized as if it were poor
  (Section 5).
- **Deterministic** — identical input attributes and identical configuration yield the
  identical score; there is no randomness and no inference (Section 9).
- **Score is a property of the evaluation, not the company** — the same company can have
  different scores under different configurations (e.g., different service offerings),
  each preserved in history (Section 7).

## 3. Signals

Signals are the evidence inputs to the score. Every signal is consumed from the
Unified Model and the enrichment layer (04, 05); the Opportunity Engine never collects
anything itself.

| Signal | Evidence it consumes | Why it matters |
|---|---|---|
| Website | Canonical Website (domain, content signals, tech hints) | Presence and quality of web footprint; identity anchor (04 §4). |
| CRM | Enrichment attribute (CRM software evidence) | Already paying for CRM ⇒ active sales motion, high fit (03 §3, 05 §3). |
| Automation | Enrichment attribute (automation software evidence) | Active marketing/sales automation ⇒ receptive organization. |
| Social Activity | Social Profile presence + activity evidence (04 §6) | Digital engagement and outreach channel availability. |
| Business Size | Employees/Revenue bands, branch count (04 §2) | Capacity, budget, tier-fit. |
| Reviews | Rating snapshots (Google Business evidence) | Public trust and social proof. |
| Branches | Branch records (isHq, count) | Scale and account breadth. |
| Growth | Employment/branch/hiring signals over time (ADR-009 dated employment) | Momentum; expansion appetite. |
| Technology | Technology fingerprints (04 §4 techHints, 05 §3) | Tech-fit: does the prospect already run what we complement? |
| Digital Presence | Aggregate footprint: website + social + directories | Overall reachability and modern posture. |

Signal rules:

- A signal is only usable when its underlying attribute is present **with an ownership
  block** (05 §7: Source, Confidence, Collected At, Verified At).
- Signals do not interpret; they report what the canonical evidence says (05 §1).
- Unverified signals are visible as lower-confidence contributions, never excluded
  silently and never promoted to fact (02 §2.7).

## 4. Recommended Services

For each scored opportunity, the engine recommends a subset of the organization's
service catalog. Recommendations are **derived from signals by explicit mapping rules**,
not by suggestion or AI.

| Service | Triggered by |
|---|---|
| Website | Weak/missing website signal, or obsolete web footprint. |
| CRM | No CRM evidence; manual/absent pipeline tooling. |
| Automation | No automation evidence; low activity with growth signals. |
| SEO | Website present but weak digital presence/footprint. |
| Marketing | Social activity low relative to market category. |
| AI | High digital presence + size + technology adoption signals. |
| Custom Software | Technology evidence indicates a gap or a bespoke need. |

Rules:

- Each recommendation cites the **signal and evidence** that triggered it (Section 5).
- Recommendations are **candidate suggestions for the sales team**, never automatic
  offers and never claims about the company's needs (Section 8).
- The mapping rules are configuration, versioned with the score; a rule change reranks
  future recommendations without rewriting past ones (Section 7).

## 5. Explainability

Every score and every recommendation must be explainable. Explainability is not a
feature of the report — it is a property of the score record. Each scored opportunity
carries, for its score and per signal:

- **Why** — which signal groups contributed and how (which aggregation path was taken).
- **Evidence** — the exact attributes, sources, and imports that produced each
  contributing value (05 §7 ownership block, correlationId lineage).
- **Missing evidence** — which signal groups had no evidence, explicitly listed, so a
  low score is never a mystery and never mistaken for a poor company.
- **Confidence** — the computed per-value confidences feeding the score (05 §7), plus
  an overall score confidence reflecting how much of the score is verified vs
  candidate.

Explainability rules:

- A score without a why is rejected; the engine cannot emit an unreadable score.
- Every recommendation lists the triggering evidence (Section 4).
- The score record is immutable (Section 7), so an explanation can never be silently
  rewritten after the fact.

## 6. Priority

Prioritization classifies opportunities into Hot / Warm / Cold for the sales queue.
Priority is a **band over the score plus explicit overrides**, never a separate secret
ranking.

| Band | Meaning | Determined by |
|---|---|---|
| **Hot** | High fit + high confidence evidence; ready for immediate outreach. | Top score band with verified key signals (email/phone reachability, business status). |
| **Warm** | Promising fit but incomplete or less-confident evidence; requires nurture or more enrichment (05 §5). | Mid score band, or high fit with missing verification. |
| **Cold** | Low current fit or insufficient evidence; keep in pool, schedule re-enrichment (05 §5). | Low score band or sparse evidence; never a judgment of company worth. |

Rules:

- Bands are thresholds on the score, defined by the same versioned configuration as the
  score (Section 2).
- An authorized human can override a band (promote/demote) for a concrete recorded
  reason; the override is part of history (Section 7).
- "Cold" never means "bad company" — it means "not an opportunity under current
  configuration/evidence"; re-enrichment and score recalculation (Section 7) can move
  it.

## 7. Score History

The Opportunity Score is versioned, recalculated, event-driven, and append-only — like
the rest of the platform (04 §12).

- **Versioning** — score configuration (signal groups, weights, aggregation rule,
  recommendation mappings, band thresholds) is versioned. Each computed score records
  which configuration version produced it. A configuration change produces a **new
  version**; it never edits old scores.
- **Recalculation** — a score is recalculated when its input evidence changes in a
  material way (new verified attribute, verification expiry, enrichment depth change,
  merge, or a new configuration version). Recalculation computes a **new score record**;
  the old record stays as history.
- **Events** — score computed, score recalculated, priority band changed, recommendation
  set changed, override recorded. Events feed workflows and operators (02 §3,
  10-workflow.md, 11-automation-job.md).
- **History** — every score record is immutable: configuration version, input evidence
  (cited), the computed sub-scores, the final score, band, recommendations, and the
  explanation (Section 5). A company's opportunity history is the append-only chain of
  these records.

## 8. AI Relationship

The ordering of the pipeline is non-negotiable:

```
… → Opportunity (engine) → AI Insights (consumes Opportunity) → CRM
```

- **Opportunity is produced before AI.** The Opportunity Engine is deterministic and
  explainable (Section 9); it runs on verified, quality-scored evidence and needs no AI
  to produce a score.
- **AI consumes Opportunity.** AI Insights (02 §2.10) read scored opportunities — their
  signals, explanations, priorities, and recommendations — to suggest next steps
  (outreach hints, re-enrichment candidates, stale-verification alerts, nurture
  suggestions).
- **AI never replaces Opportunity.** AI cannot create, alter, or reorder an Opportunity
  score; it cannot change a priority band, a recommendation, or an explanation
  (02 §2.10, 06-search-execution.md §12). AI suggestions are advisory, auditable, and
  require human or workflow approval to affect the pipeline.

This separation guarantees that a hallucinating or drifting AI can confuse a sales
workflow but can never corrupt the scoring foundation.

## 9. Design Principles

1. **Deterministic** — identical evidence + identical configuration = identical score
   and identical recommendations, every time, in every workspace.
2. **Explainable** — every score and recommendation carries its why, evidence, missing
   evidence, and confidence (Section 5).
3. **Evidence-driven** — only owned attributes (05 §7) contribute; unverified values are
   visible as lower confidence, never as hidden adjustments.
4. **Repeatable** — versioned configuration + append-only score records make any score
   reproducible and auditable at any later date (Section 7).
5. **No hallucination** — the engine asserts nothing that is not in the canonical
   evidence; there is no inference, generation, or free text in a score record.
6. **No hidden scoring** — every input, weight, threshold, and override is published
   configuration or recorded history; there is no secret factor in the score.

## Related Review Decisions

- Implements 02-search-pipeline.md §2.9 (Opportunity stage) and defines the scoring
  engine it consumes; consistent with §2.10 (AI consumes, never produces).
- Consumes enrichment output (05-enrichment-engine.md §7 attribute ownership) and
  verified/quality evidence (08, 09).
- Aligns with GLOSSARY.md "Engagement & Opportunity": Lead = subject + metadata, role
  per team/workspace; an Opportunity is the scored evaluation built on top.
- Reuses the Unified Model (04) for all signals; no provider-specific data enters the
  score (02 stage independence, 04 §13).

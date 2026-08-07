# 07 — AI Insights

Status: Draft v1.0 (Phase 5.4)
Cross-referenced by: MASTER_ARCHITECTURE.md §8, 02-search-pipeline.md §2.10, 06-opportunity-engine.md §8, 05-enrichment-engine.md, 04-unified-search-model.md, 08-verification-record.md, 09-data-quality-record.md, 06-search-execution.md §12

## 1. Vision

AI's role in the platform is **analysis and communication, never acquisition and never
decision-making**. The pipeline collects, normalizes, matches, merges, enriches,
verifies, scores, and only then asks AI to make that intelligence useful to humans.

**AI does not collect data.** AI never calls providers, never creates or cancels Search
Executions, never confirms verification, never auto-merges, and never writes to the
canonical model (02 §2.10, 06-search-execution.md §12).

AI consumes only what the platform already produced:

| Consumes | From | Used to |
|---|---|---|
| Canonical Data | Unified Model (04) | Ground every statement in real, attributed entities and values. |
| Enrichment | Enrichment Engine (05 §7 attribute ownership) | Reference owned attributes with their confidence and provenance. |
| Verification | Verification Records (08) | Distinguish verified facts from candidates; never restate an unverified value as fact. |
| Data Quality | Data Quality Records (09) | Reflect record completeness, freshness, and trustworthiness. |
| Opportunity | Opportunity Engine (06) | Narrate the deterministic score, priorities, and recommendations — never to alter them (06 §8). |

The output of AI is an **insight**: a grounded, attributed, explainable statement that
a human can read, trust, and act on — or discard. AI makes the intelligence legible; it
does not change the intelligence.

## 2. Insight Types

An insight type is a defined, versioned output shape. Each type has a fixed contract
(what evidence it may consume, what it may assert, what confidence range it can carry).
Types are composable into packs (Section 3).

| Insight type | What it asserts | Evidence it may consume | Constraint |
|---|---|---|---|
| **Business Summary** | A neutral description of the company: identity, structure, footprint. | Canonical Company/Website/Social, verified attributes. | Descriptive only; no recommendations, no speculation. |
| **Pain Points** | Evidence-derived likely friction points (e.g., no CRM, weak digital footprint). | Enrichment attributes, signal gaps, Data Quality. | Must be phrased as **inference from evidence**, with the specific evidence cited; never an assertion about the company's internal state. |
| **Recommended Services** | Presentation of the Opportunity Engine's deterministic recommendations (06 §4). | Opportunity recommendations + the signals that triggered them. | **Never generates or reorders recommendations.** It narrates and explains the engine's output only. |
| **Digital Maturity** | A grounded maturity assessment from signal coverage. | Website, Social, Technology, Automation signals. | Composite of evidence presence/strength; every level tied to cited signals. |
| **Sales Talking Points** | Conversation angles derived from verified facts and opportunity evidence. | Opportunity, verified attributes, verification records. | Each point cites the fact it is built on; labeled as talking points, not claims. |
| **Objection Prediction** | Likely objections inferred from evidence gaps and weak signals. | Data Quality, missing evidence, low-confidence attributes. | Explicitly an **inference**, with confidence and the evidence (including missing evidence) it rests on. |
| **Executive Summary** | Concise, board-ready narrative of the company and opportunity. | The same consumed data, executive framing. | No new facts beyond the source data; tone is the only variable. |
| **Technical Summary** | Technology-focused narrative: stack, integration fit, engineering signals. | Technology fingerprints (04 §4), Website techHints, technical enrichment. | Facts only where technology evidence exists; gaps reported as gaps. |
| **Marketing Summary** | Audience/footprint narrative for marketing use. | Social activity, digital presence, categories, reviews. | Same grounding; marketing framing only. |

Rules across all types:

- An insight type may assert **only what its consumed evidence supports**; anything
  beyond is prohibited (Section 4).
- Inferences (Pain Points, Objection Prediction) carry an explicit `inference` flag and
  a confidence below verified statements — the reader always knows what is fact and
  what is reasoned.
- An insight type that has no supporting evidence produces **no insight**, or an
  explicitly "insufficient evidence" output — never a plausible-sounding guess.

## 3. Insight Packs

An Insight Pack is a **fixed composition of insight types** assembled for one audience.
Every pack consumes the **same platform data**; only the selection, ordering, framing,
and depth of the presented types differ.

| Pack | Audience | Composes | Framing |
|---|---|---|---|
| **Executive Pack** | Leadership/decision-makers | Business Summary, Digital Maturity, Opportunity summary, Executive Summary | Strategic, concise, decision-oriented. |
| **Sales Pack** | Account executives | Sales Talking Points, Recommended Services, Objection Prediction, Opportunity details | Conversation-ready, objection-aware. |
| **Marketing Pack** | Growth/marketing | Marketing Summary, Social/Digital signals, Review/Activity evidence | Audience and positioning focused. |
| **Technical Pack** | Engineering/sales-engineers | Technical Summary, Technology signals, Integration fit | Stack-level precision. |
| **Operations Pack** | Ops/enablement | Data Quality, Coverage, Enrichment depth, Re-enrichment needs | Health and pipeline operationalization. |

Pack rules:

- Packs are **configuration over the same evidence set** — they do not grant AI new
  access or new facts. The difference is presentation, never provenance.
- New packs are additive compositions of existing insight types; a new pack never
  invents a new assertion power.
- Each pack output is itself explainable (Section 5), so a Sales Pack and an Executive
  Pack that disagree on framing still cite identical evidence and confidence.

## 4. Grounded AI

Grounded AI is the binding constraint of the whole engine:

1. **Facts first** — an insight's statements come before any reasoning. Every assertion
   in an insight is either (a) a restatement of a verified/owned fact, or (b) an
   explicitly labeled inference from cited evidence. Nothing else exists.
2. **Evidence first** — reasoning is built bottom-up from the consumed evidence
   (Section 1 table). If an argument cannot cite its evidence, it is not generated.
3. **No hallucination** — AI never invents a fact, a number, a name, a date, or a
   capability. Generation is limited to *rephrasing and connecting evidence*; the
   allowed output vocabulary is constrained per insight type.
4. **Missing evidence must remain missing** — if evidence does not exist, the insight
   says so. Gaps are reported as gaps (Data Quality 09 records gaps explicitly), and
   never filled by plausibility.
5. **AI must never invent facts** — this overrides all other considerations. An insight
   that cannot be fully grounded is downgraded (fewer statements, lower confidence) or
   suppressed — never padded.

## 5. Explainability

Every insight includes, and every pack embeds, a fixed explainability block. An insight
without its block is not an insight:

| Element | Meaning |
|---|---|
| **Evidence** | The specific canonical attributes, records, and imports each statement rests on (05 §7 ownership, correlationId). |
| **Confidence** | A computed confidence per statement and for the insight overall — derived from verification (08) and Data Quality (09), never a model's self-assessed claim. |
| **Reason** | Why the statement was made: which evidence-to-insight rule produced it. |
| **Related Attributes** | The canonical attributes referenced, linked so a user can navigate to their provenance. |
| **Missing Evidence** | What would strengthen or change the insight, explicitly listed; ties to re-enrichment (05 §5) and Data Quality (09). |

## 6. Prompt Layer

The Prompt Layer is the governance boundary between the platform and the AI model.
It is **architecture only** — this document describes the layer, not prompts.

- **Prompt templates** — each insight type/pack maps to a template: a fixed structural
  contract (allowed inputs, allowed assertions, output shape, explainability block).
  Templates are versioned artifacts, authored and reviewed by humans, and stored
  separately from code so they are auditable and replaceable without a deploy cycle.
- **Prompt versioning** — every template has a version; generated insights record the
  template version that produced them, so any insight can be regenerated or audited
  against the exact template that made it. Template upgrades change the version; they
  never silently change past insights.
- **Prompt governance** — template changes follow the same review path as any
  architecture decision: they must not expand the assertions an insight type may make
  (Section 2 constraints) or weaken the explainability block (Section 5). A template
  that would let AI state a fact without evidence is rejected by governance before it
  ever reaches a model.
- The layer guarantees that **the model is only ever asked to rephrase and connect
  given evidence** — never to recall, extrapolate, or answer from its own knowledge.

## 7. AI Safety

Safety is structural, not behavioral. The engine is safe because unsafe outputs are
**unrepresentable**, not because the model is trusted.

- **Hallucination prevention** — the output contract (Section 2 types, Section 6
  templates) structurally forbids assertions without cited evidence; the explainability
  block (Section 5) is mandatory, making an ungrounded statement detectable by
  construction.
- **Prompt injection resistance** — consumed data (e.g., an enriched website text or
  social snippet) is **data, never instructions**. Data arrives in a quarantined
  channel, is never concatenated into the instruction channel, and is only quotable as
  evidence, never executable as direction. Template changes are governed (Section 6);
  data cannot change templates.
- **Source isolation** — provider-collected content and human-authored content flow in
  separate channels with different trust levels; an insight always declares which
  channel each citation came from (Source isolation mirrors 01 §6 isolation).
- **Deterministic boundaries** — AI output never feeds back into collection, matching,
  merge, verification, scoring, or priority (02 §2.10, 06 §8). The only downstream
  surface is human-facing presentation and advisory workflow suggestions.
- **Human review** — insights are advisory; humans approve anything that changes the
  pipeline (re-enrichment requests, verification follow-ups, schedule proposals).
  A human can discard an insight; nothing in the platform acts on an insight
  automatically (06-search-execution.md §12, 10-workflow.md).

## 8. Design Principles

1. **Grounded** — every statement is a restatement of evidence or a labeled inference
   from cited evidence (Section 4).
2. **Explainable** — every insight carries the full explainability block; unexplained
   output is not emitted (Section 5).
3. **Evidence-driven** — insight power is bounded by what the platform verified,
   enriched, and scored; AI adds framing, never facts.
4. **Composable** — insight types compose into packs; packs add no new assertion power,
   only presentation (Section 3).
5. **Auditable** — every insight records its evidence, template version, and model
   version; any insight is reproducible at any later date.
6. **Versioned** — prompt templates, insight-type contracts, and pack compositions are
   versioned; past insights never change when a template does (Sections 2, 3, 6).

## Related Review Decisions

- Implements 02-search-pipeline.md §2.10 (AI Insights) and 06-opportunity-engine.md §8
  (Opportunity before AI; AI consumes, never replaces).
- Enforces 06-search-execution.md §12 (AI never creates/cancels executions, never
  confirms verification, never auto-merges).
- Consumes 04-unified-search-model.md, 05-enrichment-engine.md §7, 08/09, and the
  Opportunity Engine (06) — all read-only.
- No conflict found with prior phases; doc 02/06 framing of AI as advisory is carried
  and strengthened here.

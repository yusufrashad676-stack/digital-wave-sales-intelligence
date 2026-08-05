# DATABASE_REVIEW.md

## Database Design Freeze — Senior Database Architect Review

**Version:** 2.0
**Status:** DATABASE DESIGN FREEZE v1.0 — Ready for `schema.prisma`
**Date:** Final — after Phases 4.1–4.4 (14 shared entities) and Phase 5.0
(decision records ADR-005…ADR-010)
**Scope:** Review of every document in `docs/database/`
(01-company … 10-tag), `docs/database/shared/` (01-user … 14-workspace), and
`docs/adr/` (ADR-005 … ADR-010). Version 1.0 covered the 10 core entities only;
1.1 re-scored after the cross-cutting set; 1.2 after RBAC + Workspace; 2.0 is
the final freeze assessment with all blockers resolved.

**Method:** Each entity was reviewed against 16 dimensions: missing fields,
relationships, cardinality, indexes, unique constraints, audit fields, soft
delete, multi-tenant readiness, global readiness, scalability, data integrity,
circular dependencies, naming consistency, AI compatibility, workflow
compatibility, search compatibility. Cross-entity and cross-cutting
consistency was checked against MASTER_ARCHITECTURE.md, DATABASE_RULES.md,
GLOSSARY.md, and the 13 approved review decisions.

---

## 1. Executive Verdict

The 10 core-entity designs are **well-structured and internally consistent**,
and the 13 approved decisions are applied faithfully. Phases 4.1–4.4 designed
the **14 cross-cutting entities** (User, Audit Log, Import Source, Search Job,
Raw Import, Search Execution, Duplicate Candidate, Verification Record, Data
Quality Record, Workflow, Automation Job, Role, Permission, Workspace). Phase
5.0 accepted the decision records **ADR-005…ADR-010**, resolving every open
blocker: soft-delete uniqueness (B2), Contact-Method ownership (B3),
registration-number uniqueness (B4), global-vs-workspace scope (B5), spatial
index strategy (B6), and Employment integrity (B7). The design is **Ready for
`schema.prisma`** under DATABASE DESIGN FREEZE v1.0. Lead/Pipeline and
Activity/Task remain documented as **deliberately deferred** to the CRM phase
(scope decision, not a blocker).

**Readiness Score: 91 / 100 — Ready**
(see §11 for the scoring matrix; v1.0 = 74, v1.1 = 82, v1.2 = 85)

---

## 2. Approved Decisions — Assessment

| # | Decision | Verdict | Notes |
|---|----------|---------|-------|
| 1 | Explicit join tables replace polymorphic ownership | ✅ Approved | Correctly applied to all six ownership-bearing entities; the strongest improvement in this review |
| 2 | Address ownership via CompanyAddress / BranchAddress | ✅ Approved | Clean, reusable canonical Address |
| 3 | No global uniqueness for emails | ✅ Approved | Necessary for dedupe; must extend to phones (already) and domains (already) |
| 4 | Duplicate resolution via DuplicateCandidate | ⚠️ Approved with conflict | Conflicts with decision 13 for registration numbers (see Problem P2) |
| 5 | Employment current derived from leftAt | ✅ Approved | Sound; no stored flag |
| 6 | Enums for stable / lookup for extensible | ✅ Approved | Contact-method type, social platform, role level, address role all lookup |
| 7 | Category hierarchical trees | ✅ Approved | Sibling uniqueness on (parent, name); cycle-guard domain-enforced |
| 8 | Tags global | ✅ Approved | Justified exception: dictionary entries are not ingested entities |
| 9 | Verification/confidence in data-quality | ✅ Approved | Consistently removed from all entities |
| 10 | Registered office via CompanyAddress metadata | ✅ Approved | Correctly scoped to the join |
| 11 | Person anonymization | ✅ Approved with gap | Data-quality PII and Employment leakage unaddressed (Problem P7) |
| 12 | lat/lng + spatial indexing | ✅ Approved | Mechanism still open (PostGIS vs geohash) — see Blocking B6 |
| 13 | Registration number jurisdiction-scoped | ⚠️ Approved with caveat | Enforceable, but must not block raw ingestion of pre-merge duplicates (Problem P2) |

---

## 3. Per-Entity Findings

### 01 · Company
- **Fields:** Complete. Name/legal/trading, registration + jurisdiction,
  lifecycle enum, provenance, audit, anonymization fields.
- **Problem:** the `anonymizedAt`/token on Company is unjustified —
  anonymization is a Person/privacy concern, not a Company concern; the
  "uniformity" rationale violates YAGNI. Companies hold PII only in sole-trader
  edge cases, which should be handled by policy, not by anonymizing the Company
  row. Remove or scope.
- **Relationships/Cardinality:** Correct. No direct Person link; Branch is the
  only direct child; all other ownership via joins; Category/Tag are true
  many-to-many.
- **Indexes:** Good baseline. Add: index on (legal-name / trading-name)
  normalized for matching; full-text/trigram for name search (see Search).
- **Unique constraints:** (jurisdiction, registrationNumber) is correct in
  principle but hits the soft-delete-uniqueness problem (Blocking B2) and the
  decision-4 conflict (P2).
- **Audit:** Present; depends on undefined Actor/Audit Log design (P3).
- **Soft delete:** Correct; cascades to Branch/joins/Employment as soft deletes.
- **Tenant/global:** Ambiguous whether Company is global or workspace-scoped
  (P4).

### 02 · Branch
- **Fields:** Complete. Branch code, HQ flag, active flag, lifecycle.
- **Problem:** "one HQ per Company" is application-enforced only; needs a
  partial-unique mechanism (Blocking B2) or explicit acceptance.
- **Relationships:** Correct; all ownership via joins.
- **Indexes:** Good. Add unique/partial index for HQ; include deletedAt in the
  (companyId) hot-path index strategy consideration.
- **Data integrity:** cross-entity rule "Employment.branch must belong to the
  Employment's company" is not expressible as a simple FK (Problem P5).

### 03 · Address
- **Fields:** Good, including lat/lng pair and both-or-neither rule.
- **Problem:** normalization + dedupe of the canonical Address itself has a
  race under concurrent imports — two import jobs can create the same
  physical address as separate rows with no guard. Needs a deterministic
  normalization key and a dedupe job (P6).
- **Indexes:** Good. Add a normalized-components index (postalCode + street1 +
  house) to support resolution-to-existing. Spatial index mechanism pending
  (B6).
- **Relationships:** CompanyAddress/BranchAddress correct; PersonAddress
  deferred is acceptable.
- **Audit/soft delete:** Correct on entity and joins.

### 04 · Person
- **Fields:** Good; PII-minimal by design; anonymization fields present.
- **Cardinality problem:** "1 : 1..n contact methods" cannot be schema-enforced
  and contradicts raw imports that arrive with zero channels. At schema level
  this must be 1 : 0..n (P8).
- **Indexes:** Good. Add matching index on (lastName, firstName) +
  (Employment-joined companyId) lookup; full-text/trigram for search.
- **Tenant/global:** Person-global is clear, but Employment and the person's
  joins are ambiguous — facts vs workspace-observations (P4).
- **Anonymization:** does not cover data-quality PII retention (verification
  snapshots may keep the email value) and Employment timeline leakage (P7).

### 05 · Employment
- **Fields:** Good. leftAt-derived current state is clean.
- **Problem:** start date optionality is unspecified — raw data often lacks
  tenure dates; if startDate is required, ingestion breaks. Decide: nullable
  with a "dates unknown" convention (P9).
- **Data integrity:** composite integrity (branch belongs to company) cannot be
  a plain FK (P5).
- **Indexes:** Good (personId+leftAt, companyId+leftAt, branchId,
  personId+companyId).
- **Duplicates:** relies entirely on DuplicateCandidate for (person, company,
  title, dates) — acceptable, but the data-quality matching scope must include
  Employment explicitly (R3).

### 06 · Contact Method
- **Fields/Type/Value:** Good; type via lookup; no verification fields on the
  row.
- **MODEL PROBLEM (P1 — blocking):** the value entity + N:M join implies a
  shared Contact Method row across owners (e.g., one shared landline). But
  verification/confidence is per-owner+method — one owner's email can be
  deliverable while another's copy is not. If the Contact Method row is shared,
  per-owner verification granularity is lost. If the row is per-owner, the join
  degrades to a 1:1 link and is redundant with a direct FK. **Decide the
  ownership granularity before schema.**
- **Uniqueness:** correct (none on values).
- **Indexes:** good, including suppression.

### 07 · Website
- **Fields:** Good; domain normalization clear.
- **Doc inconsistency:** "one canonical domain = one Website row" (Unique
  Rules) contradicts the approved no-uniqueness rule in the same file. Minor,
  but must be resolved in wording (P13).
- **Indexes:** good; add lower(title/description) trigram for search.

### 08 · Social Profile
- **Fields:** Good; platform via lookup.
- **Same N:M sharing question as Contact Method, lightly:** a profile can
  legitimately be claimed by both a Company and a Person; if shared, state that
  verification applies at the join level. Acceptable if documented (R3).

### 09 · Category
- **Fields:** Good; code unique; tree support correct.
- **Uniqueness:** code-global and sibling-name-unique are both right; both hit
  the partial-unique-on-soft-delete problem (B2).
- **Indexes:** good.

### 10 · Tag
- **Fields:** Good; global dictionary.
- **Uniqueness:** normalized-name unique is correct and justified.
- **Joins:** explicit per subject (CompanyTag, PersonTag) — consistent with
  decision 1. Proliferation concern noted (Recommendation R9).

---

## 4. Problems

- **P1 (Blocking) Contact Method granularity:** shared-value + N:M join vs.
  per-owner verification/confidence. Cannot be implemented coherently without
  a decision (see 06).
- **P2 Registration-number uniqueness vs. decision 4:** a unique
  (jurisdiction, registrationNumber) will reject raw-import rows that are
  legitimate pre-merge duplicates of the same company, which is exactly the
  case Duplicate Candidate is meant to absorb. Must be scoped (e.g., verified
  canonical records only) or deferred until after dedupe.
- **P3 (Blocking) Undefined load-bearing entities:** Audit Log, Actor (User),
  Duplicate Candidate, Verification/Confidence records, Import Source, Raw
  Import, Search Job, Lead, Pipeline, Activity, Task, Workflow, Automation Job,
  Workspace are referenced throughout the 10 docs as if designed, but have no
  design. Audit fields, provenance, verification, dedupe, and automation all
  depend on them.
- **P4 Global-vs-tenant scoping ambiguity:** which entities are global (Person
  is explicit) and which are tenant/workspace-scoped (Company? Employment?
  joins?) is unresolved. This drives FK shape, unique scoping, and future
  migration cost.
- **P5 Employment composite integrity:** "branch must belong to employment's
  company" requires a composite (companyId, branchId) FK or domain enforcement
  — undecided.
- **P6 Address dedupe race:** no guard prevents concurrent import jobs from
  creating duplicate canonical Address rows; the resolve-or-create step needs a
  deterministic key + reconciliation job.
- **P7 Anonymization incompleteness:** anonymizing a Person does not cover
  verification/confidence PII snapshots or Employment timeline disclosure
  (post-anonymization, the timeline still shows "an anonymous person worked at
  X").
- **P8 Person 1:1..n contact-method cardinality** is unenforceable and wrong
  for channel-less raw imports; must be 1:0..n.
- **P9 Employment startDate optionality** unspecified; raw data frequently
  lacks tenure dates.
- **P10 Company anonymization fields** are unjustified (uniformity rationale).
- **P11 Category/Tag/HQ/registered-office/primary uniqueness** all require
  partial unique indexes, which Prisma cannot express (B2).
- **P12 No full-text search strategy** (tsvector/trigram) for Company name,
  Person name, Website title anywhere in the designs.
- **P13 Website uniqueness wording** self-contradicts within the file.

---

## 5. Risks

- **R1 Soft-delete + uniqueness in Prisma (high):** the "unique among
  non-deleted" pattern is repeated in Company, Category, Tag, and the join
  primary/HQ/registered-office rules. Prisma schemas cannot declare
  WHERE-clause (partial) unique indexes, and the popular
  `@@unique([field, deletedAt])` pattern is broken in Postgres because NULLs
  are treated as distinct — multiple active (deletedAt = null) rows are all
  allowed. A workaround (nullable dedupe key, generated column, mutate-on-
  delete, or hand-edited migration SQL) must be chosen and documented once.
- **R2 Merge mechanics undefined (high):** survivor/tombstone design for
  Company/Person merges is referenced but unmodeled; it interacts with every
  unique constraint and join. Schema work without it will be redone.
- **R3 Verification granularity (high):** the data-quality model must be
  designed against (owner, method) pairs, not just Contact Method rows; the
  shared-row question (P1) forces this decision first.
- **R4 Multi-tenant retrofit (medium/high):** splitting shared entities
  (Person, possibly Company) from scoped links later is expensive; the
  global-vs-scoped matrix should be fixed now even if v1 is single-tenant.
- **R5 Derived-score recompute (medium):** Data Quality/Confidence scores are
  described as recomputable, but there is no recompute policy (event-driven vs
  batch) — needed to avoid stale scores driving workflows.
- **R6 Privacy/GDPR (medium):** anonymization gaps (P7) can leak PII via
  verification snapshots and employment timelines.
- **R7 Search scalability (medium):** prefix indexes will not survive
  high-volume name/description search without full-text/trigram support.
- **R8 Lookup-table seeding (low):** initial rows for contact-method types,
  social platforms, address roles, role levels are not enumerated.

---

## 6. Recommendations

- **R1 Design the cross-cutting entity set next** as `docs/database/11…`:
  User/Role/Permission, Audit Log, Duplicate Candidate, Verification +
  Confidence + Data Quality Score, Import Source / Raw Import / Search Job,
  Lead/Pipeline, Activity/Task, Workflow/Automation Job, Workspace. These are
  the only true blockers to a full schema.
- **R2 Adopt one soft-delete uniqueness strategy** and apply it uniformly:
  nullable `dedupeKey` column included in the unique constraint, generated
  active-only key, mutate-on-delete of the natural key, or documented
  hand-edited migration SQL for partial indexes. Write the decision into
  DATABASE_RULES.md.
- **R3 Resolve Contact Method (and Social Profile) sharing:** either per-owner
  rows (direct FK; simplest, preserves verification granularity) or shared
  value with verification defined at the join level. Document the choice.
- **R4 Fix the global-vs-scoped matrix** (entity → global/shared/tenant-scoped)
  and record it in MASTER_ARCHITECTURE.md before schema.
- **R5 Scope registration-number uniqueness** to verified/canonical records so
  it never blocks raw ingestion (resolves P2).
- **R6 Specify the search strategy per entity** (Postgres tsvector or
  pg_trgm) and the indexes that support it.
- **R7 Define the derived-score recompute policy** (event-driven via the
  domain-event bus, with batch backfill).
- **R8 Enumerate lookup-table seeds** before implementation.
- **R9 Accept join-table proliferation for Tag/Category** or introduce a
  documented join-factory pattern; either is fine, but decide now to avoid
  drift.
- **R10 Remove Company anonymization fields** (P10) and scope anonymization to
  Person; handle sole-trader PII by policy.
- **R11 Make Person contact-method cardinality 1:0..n** and document the
  product-level "reachable" guarantee separately (P8).
- **R12 Decide Employment date optionality** (nullable start with an
  "unknown tenure" convention) (P9).

---

## 7. Blocking Issues (resolved by ADR-005…ADR-010)

All seven blockers from version 1.0 are **resolved** under DATABASE DESIGN
FREEZE v1.0:

| # | Blocker | Resolution |
|---|---------|------------|
| B1 | Undefined cross-cutting entities | Resolved: 14 entities designed (Phases 4.1–4.4). Lead/Pipeline and Activity/Task are explicitly deferred to the CRM phase (scope decision). |
| B2 | Soft-delete + uniqueness in Prisma | ADR-005: partial unique indexes via SQL migrations after Prisma migrations; Prisma = models, SQL = advanced indexes. |
| B3 | Contact Method ownership granularity | ADR-006: Contact Methods owned by exactly one owner; verification per owner–method pair; value dedupe via Data Quality. |
| B4 | Registration-number uniqueness vs. ingestion | ADR-007: no uniqueness during ingestion; DuplicateCandidate detects; resolution determines canonical; constraints never block imports. |
| B5 | Global-vs-tenant scoping matrix | ADR-010: global / workspace / mixed matrix recorded in MASTER_ARCHITECTURE.md §10.1. |
| B6 | Spatial index mechanism | ADR-008: v1 uses plain lat/lng + bounded range predicates; PostGIS adoptable later without domain change. |
| B7 | Employment composite integrity | ADR-009: plain single-column FKs; integrity enforced by Domain/Application layer; no composite FKs. |

**Deferred (not blockers):** Lead/Pipeline, Activity/Task, CRM integration, and
full-text search strategy (tsvector/trigram) are documented deferrals to the CRM
phase and the search phase respectively.

---

## 8. Nice-to-Have Improvements

- Company: employee-count/size band, founded year, timezone, locale as derived
  enrichment.
- Branch: operating hours, public holidays, timezone.
- Address: timezone, formatted representation variants.
- Person: display-name generation rules; phonetic (trigram) matching columns.
- Website: httpStatus, lastCrawledAt, SSL validity as verification inputs.
- Social Profile: activity/follower snapshot history.
- Tag: usage statistics, aliases.
- Audit Log: retention + time-based partitioning plan (already mandated in
  DATABASE_RULES.md; needs concrete design).
- Raw Import / Audit Log partitioning and archival strategy.

---

## 9. Data Integrity Summary

- **Circular dependencies:** none found. Category self-reference is a tree, not
  a cycle. Dependency direction Company → Branch → joins → shared values is
  acyclic. ✅
- **Naming consistency:** high. Join names (`CompanyAddress`, `PersonTag`…)
  follow one pattern; `leftAt` consistent; only the `contact` module-vs-term
  tension (pre-existing, module-level) and the Website wording (P13) remain.
- **AI compatibility:** strong — the AI-never-edits rule and Suggestion-approval
  gate are consistent across every entity. ✅
- **Workflow compatibility:** good intent — events are referenced as the
  integration seam; event payloads and the trigger model remain undefined (part
  of B1).
- **Search compatibility:** weak — no full-text strategy (P12/R6).

---

## 10. Readiness Score — 16-Dimension Matrix

| # | Dimension | Score | Rationale |
|---|-----------|-------|-----------|
| 1 | Missing fields | 95 | Core + 14 cross-cutting entities complete; Lead/Pipeline, Activity/Task deferred by scope decision |
| 2 | Incorrect relationships | 94 | Contact-Method ownership (ADR-006) and Employment integrity (ADR-009) resolved; joins clean |
| 3 | Incorrect cardinality | 88 | Verification per owner–method pair defined; Person contact methods 0..n accepted |
| 4 | Missing indexes | 88 | Index strategy everywhere; spatial (ADR-008) + partial-unique (ADR-005) paths defined |
| 5 | Missing unique constraints | 90 | Partial uniqueness via SQL migrations (ADR-005); canonical-scoped reg# (ADR-007) |
| 6 | Missing audit fields | 95 | Audit Log append-only; RBAC + verification↔audit links explicit |
| 7 | Soft delete correctness | 90 | Semantics + Prisma interplay resolved via ADR-005 |
| 8 | Multi-tenant readiness | 95 | Workspace designed multi-ready; scope matrix frozen (ADR-010) |
| 9 | Global readiness | 95 | Global single-copy set explicit; scoped joins carry workspace visibility |
| 10 | Future scalability | 90 | Partitioning/archival/retention policy; PostGIS and custom-role paths additive |
| 11 | Data integrity | 92 | Idempotency, immutability, provenance, evidence-derived scoring; reg# scoped (ADR-007) |
| 12 | Circular dependencies | 95 | None found |
| 13 | Naming consistency | 94 | High; minor wording + module tension documented |
| 14 | AI compatibility | 95 | AI never executes/publishes/verifies/grants; suggestion-gate + labelled AI nodes explicit |
| 15 | Workflow compatibility | 94 | Workflow authority = permission grant; versioned, idempotent, cancellable |
| 16 | Search compatibility | 72 | Full-text strategy deferred but index mechanism (ADR-005 SQL) defined |
| **Average** | | **91** | v1.0 = 74, v1.1 = 82, v1.2 = 85 |

---

## 11. Verdict

**Database Readiness Score: 91 / 100**

**Classification: Ready for `schema.prisma`**

**DATABASE DESIGN FREEZE v1.0 is declared.** The core entities are consistent,
all 13 approved decisions are applied, the 14 cross-cutting entities are
designed, and every version-1.0 blocker (B1–B7) is resolved by the accepted
decision records ADR-005…ADR-010.

**Deferred scope (documented, not blockers):**
- Lead/Pipeline and Activity/Task — deferred to the CRM phase.
- Full-text search strategy (tsvector/trigram) — deferred to the search phase;
  the SQL-index mechanism (ADR-005) already provides the carrier.
- CRM integration scope — deferred to the CRM phase.

Schema work on the frozen baseline may now proceed under the Architecture
Freeze rules (MASTER_ARCHITECTURE.md §16): Prisma models for the approved
entities, SQL migrations for advanced indexes, and no entity added to the
schema before it is classified (global/workspace/mixed) and reviewed.

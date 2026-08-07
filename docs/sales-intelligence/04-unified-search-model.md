# 04 — Unified Search Model

Status: Draft v1.0 (Phase 5.2)
Cross-referenced by: MASTER_ARCHITECTURE.md §3, 01-provider-architecture.md, 02-search-pipeline.md, 03-search-builder.md, 03-import-source.md, 05-raw-import.md, 06-search-execution.md, 07-duplicate-candidate.md, 08-verification-record.md, 09-data-quality-record.md, ADR-006, ADR-008, ADR-009, ADR-010, DATABASE_REVIEW.md

## 1. Purpose

The Unified Search Model is the **canonical internal representation** of everything the
pipeline collects. Every provider returns a different shape (01 §1); the pipeline
normalizes all of it into this one model, so the rest of the system — matching, merge,
verification, quality, opportunity — operates on a single, provider-agnostic structure.

```
provider output → Normalization → Unified Search Model → Matching → Merge → Verification → …
```

The Unified Model is **not a new database**: it is the conceptual identity layer that
maps to the implemented database entities, aligned with the canonical freeze
(ADR-005…010, DATABASE_REVIEW.md v2.0, MASTER_ARCHITECTURE.md v1.2). Where this document
and the implemented schema disagree, the conflict is recorded (Section 12), not silently
resolved here.

## 2. Canonical Company

A real-world business as an identity. One company = one identity, however many
providers saw it.

| Canonical attribute | Source in the Unified Model | Notes |
|---|---|---|
| Name | name + trading name | Display vs legal identity kept separate. |
| Legal identity | legalName, registrationNumber, taxVatId, jurisdiction | Jurisdiction is 2-letter code; registrationNumber is the registry anchor. |
| Status | status (ACTIVE/…) | Business Status filter target (03 §3). |
| Canonical flag | isCanonical | Marks the resolved identity after merge (Section 9). |
| Size signals | Employees, Revenue bands | Enrichment attributes (02 §2.6), evidence-cited, never fabricated. |
| Structure | Branches, HQ branch (isHq) | Branch count filter target (03 §3). |
| Relationships | Addresses, Contact Methods, Websites, Social Profiles, Categories, Tags, Employments | All through the N:M join layer (Sections 4–6). |

## 3. Canonical Person

A real-world individual. Persons exist independently of any company; employment is a
separate, dated relationship.

| Canonical attribute | Source in the Unified Model | Notes |
|---|---|---|
| Identity | firstName, lastName, middleName, displayName | Matching uses name composition, never a single free-text blob. |
| Locale | preferredLanguage | Optional, language code. |
| Media | photoUrl | Evidence of identity, not proof. |
| Employment | Employment records (title, department, startedAt, leftAt, branch) | ADR-009 alignment: employment is a dated fact, not a profile tag. |
| Relationships | Contact Methods, Social Profiles, Tags | Same N:M join layer as Company (Sections 4–6). |

## 4. Canonical Website

The website is the most durable cross-provider anchor: domains are stable, unique, and
frequently the key that links a Search result to a Social Profile to a Directory entry.

| Canonical attribute | Source in the Unified Model | Notes |
|---|---|---|
| Domain | domain | Primary identity key for the web. |
| URL | url | Canonical retrieval location. |
| Content signals | title, description | Surface signals, never trusted as facts. |
| Technology | techHints (structured evidence) | Technologies filter target (03 §3); evidence-cited enrichment. |
| Ownership | Website ↔ Company/Branch joins | A website belongs to a company (or branch) through the join layer. |

## 5. Canonical Contact Method

One canonical representation for reachable channels (email, phone, and extensible
types). The value is normalized once; ownership is recorded per subject through N:M
joins, so one phone number can legitimately belong to a branch, its company, and a
person (ADR-006 — the schema's N:M joins are the ownership model; see C1 in
Section 12).

| Canonical attribute | Source in the Unified Model | Notes |
|---|---|---|
| Type | ContactMethodType (extensible, not a closed enum) | Email/Phone/… are types, not columns. |
| Value | value (normalized form) | One canonical value; per-format quirks are provider-side (Section 10). |
| Country context | countryCode | For phone dialing context. |
| Ownership | Person/Company/Branch ↔ ContactMethod joins | Join carries isPrimary, assignedBy/assignedAt, and (for persons) suppression. |
| Primary flag | isPrimary on the join | Per-owner selection; a method can be primary for one owner and not another. |
| Verification | Verification Record (08) | Email/Phone filters are evidence-gated (03 §3). |

## 6. Canonical Social Profile

One canonical record per (platform, profile), shared across every subject it belongs to.

| Canonical attribute | Source in the Unified Model | Notes |
|---|---|---|
| Platform | SocialPlatform (registry-like) | Facebook/Instagram/LinkedIn/… (03 §3). |
| Handle | handle | Platform-local identity. |
| Profile URL | profileUrl | Retrieval evidence. |
| Platform ID | platformProfileId | Stable external identifier used for matching (Section 8). |
| Activity | activitySnapshot (structured evidence) | Social activity signals; evidence, not interpretation. |
| Ownership | Person/Company/Branch ↔ SocialProfile joins | Presence filters (03 §3) resolve through these joins. |

## 7. Normalization

Normalization maps heterogeneous provider output onto the Unified Model. It is the
boundary where provider-specific reality ends and canonical reality begins.

| Provider reality | Normalized to | Rule |
|---|---|---|
| Provider's own ID / URL | external reference on the candidate | Retained as provenance (Raw Import), never as an internal identity. |
| Address strings, varying layouts | Canonical Address (streetLine1/2, postalCode, city, region, countryCode, lat/lng, formatted) | ADR-008: plain lat/lng; countryCode always set; formatting is derived, not trusted (03 §4 dependencies revalidate). |
| Contact channels (email/phone/… shapes) | Canonical Contact Method + type | Value normalized once; type selected from the extensible type set. |
| Social handles/URLs | Canonical Social Profile per platform | Platform ID is the matching key; handle is display. |
| Website URLs (variants, www, https, trailing paths) | Canonical Website domain | Domain derivation is the only normalizing step allowed here. |
| Names (company, person) | Canonical name fields | Raw spelling preserved in evidence; canonical value chosen by rules, never by AI (Section 10). |
| Ratings/reviews | Rating evidence (timestamped snapshot) | Never a provider-recommended score; always tied to retrieval time. |
| Everything else | Raw Import, immutable (05) | Any field with no canonical slot stays in raw evidence, never dropped. |

Normalization is **lossless**: nothing is discarded; anything not mapped to a canonical
slot lives in the Raw Import and remains available for future mappings. Normalization
**never overwrites**: a new provider's value creates evidence and a candidate; existing
canonical values change only through merge/verification (Sections 9–10).

## 8. Matching

Matching detects that two canonical candidates are likely the same real-world subject.
This section describes semantics only — no implementation.

- Matching consumes **canonical** candidates (identical shape regardless of provider).
- Match signals are evidence-derived: domain equality (highest weight), platform
  profile ID equality, name similarity, address/phone overlap, registration numbers.
- Every match produces a **Duplicate Candidate** (07): advisory, `open → decided
  (confirmed/rejected)`, expiring. Matching **never merges and never mutates**.
- Confidence is a score, not a decision. Scores below the confirmation threshold leave
  the candidate open for verification or human review.
- Matching rules are configurable and auditable; changing a rule never rewrites
  history (Section 11).

## 9. Merge

Merge consolidates two subjects only after a **confirmed** Duplicate Candidate decision
(07). It is the only stage that changes identity structure.

- **Strategy**: the two records collapse into one canonical identity (`isCanonical` on
  the surviving identity); all children (addresses, contact methods, social profiles,
  websites, employments, tags, categories) are re-linked to the surviving identity.
- **Source attribution**: every surviving value keeps its lineage — which Import
  Source, which Raw Import, which provider, which execution (05/06 §4 correlationId).
  Relinking copies links, never provenance.
- **Never lose provenance**: nothing is deleted in a merge. Superseded links and the
  absorbed identity are preserved as history (Section 11); a merged-away record remains
  explainable by its imports. `importSourceRef` on every canonical entity preserves the
  originating source even after re-linking.
- **Conflict handling during merge**: per-section-conflict values are not overwritten by
  merge; they are resolved by the Conflict Resolution policy (Section 10).
- A merge is atomic per confirmed decision; partial merges are rejected
  (02 §2.5).

## 10. Conflict Resolution

Multiple providers will report different values for the same canonical attribute. The
Unified Model resolves conflicts with a consistent, evidence-first policy.

- **Confidence** is a per-value property derived from the value's evidence strength and
  freshness (Verification Records, 08; Data Quality Records, 09). It is computed, not
  guessed, and never produced by AI (06 §12).
- **Evidence beats recency**: a verified value (08 `confirmed`) outranks an unverified
  newer value; among unverified values, source priority (Section 11) and freshness
  decide.
- **Never silently overwrite**: a conflicting incoming value never replaces an existing
  one in place. It is recorded as a candidate + evidence; the canonical value changes
  only when verification confirms it or a human resolves the conflict.
- **Manual review**: values that cannot be resolved by evidence (equal-confidence
  conflicts, or conflicts on identity-critical attributes like registration number or
  domain) are surfaced as review tasks for authorized users; the task records the
  decision, actor, and evidence — mirroring Duplicate Candidate decisions (07).
- Every resolution — automatic or manual — appends a history entry with the winner,
  the loser, and the evidence that decided it (Section 12). Nothing is ever lost.

## 11. Source Priority

Source priority determines which provider's unverified value is preferred when evidence
and verification do not decide. It is **configurable, per attribute or category**, for
three reasons:

1. **Domain expertise**: a government registry is a better authority for a registration
   number; a social platform is a better authority for a person's current title. No
   single global ranking is correct.
2. **Operational reality**: provider health changes (01 §4.4); a degraded authoritative
   source should not silently dominate. Priority can be lowered without changing
   registrations or code.
3. **Evidence of bias**: a provider shown (by Data Quality Records, 09) to yield
   conflicts or stale values can be deprioritized per workspace without a code change.

Priority is metadata, not logic: it is a tie-breaker among *unverified* values, never
an override of verified evidence (Section 10) or of confirmed merge decisions
(Section 9).

## 12. Entity History

The Unified Model is **append-only history**: values are never overwritten in place.

- Every canonical entity carries creation/update/deletion audit fields and an
  `importSourceRef` (implemented schema); every import is immutable (05).
- A value change = a new candidate + evidence + history entry; the previous value
  remains in history with its own lineage.
- A merge appends re-link and supersession history (Section 9); a conflict resolution
  appends winner/loser/evidence (Section 10); verification appends immutable
  Verification Records (08); quality appends snapshots (09).
- History is preserved for as long as the raw imports that back it
  (06 §11 data retention), so every canonical value is explainable by its run.

**Recorded conflict (C1)**: ADR-006 describes direct ownership of contact methods, while
the implemented schema models ownership as N:M joins (Person/Company/Branch ↔
ContactMethod with `isPrimary`). The Unified Model follows the schema's join model, per
the governance finding that the schema is the conflicting artifact. This document does
not re-litigate the conflict; it states the operative model and defers the schema/ADR
reconciliation to the schema workstream.

## 13. Principles

1. **Single source of truth** — the Unified Model is the one internal representation.
   Providers feed it; matching, merge, verification, quality, opportunity, and CRM
   read it. No stage keeps its own second copy of a fact.
2. **No provider-specific entities** — there are no "Google companies", "LinkedIn
   persons", or "directory addresses". Provider vocabulary ends at Normalization; every
   canonical entity is provider-agnostic by construction.
3. **Canonical internal model** — one shape per real-world concept (company, person,
   website, contact method, social profile, address), regardless of how many sources
   described it.
4. **Append-only history** — never overwrite, always append. Every fact is a
   timestamped, attributed entry; the current value is the latest of a chain, not a
   destructive edit.
5. **Explainability** — every canonical value traces to its provider, execution, raw
   import, verification, and resolution (correlationId, 06 §4). If a fact cannot be
   explained, it is not a fact.

## Related Review Decisions

- Implements MASTER_ARCHITECTURE.md §3 (Search → Raw Import) identity layer.
- Aligns with ADR-008 (plain lat/lng), ADR-009 (employment as dated fact),
  ADR-010 (workspace scoping), ADR-006 (via the recorded C1 note).
- Maps to the implemented schema entities: Company, Person, Branch, Address, Website,
  SocialProfile, ContactMethod, Employment, Category, Tag, and the N:M joins with
  `isPrimary`/`role`/`assignedBy`/`assignedAt`.
- Consumes 05-raw-import.md (immutable evidence), 07-duplicate-candidate.md (matching
  decisions), 08-verification-record.md (verification), 09-data-quality-record.md
  (quality), 06-search-execution.md (execution lineage).
- Feeds 02-search-pipeline.md stages 3–7 and 03-search-builder.md filters.

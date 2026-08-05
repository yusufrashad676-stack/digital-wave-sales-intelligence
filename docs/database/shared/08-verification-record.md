# 08 — Verification Record

Status: Draft v1.0 (Phase 4.3)
Design doc cross-referenced by: DATABASE_REVIEW.md B1/B3, MASTER_ARCHITECTURE.md §3 (Verification stage), GLOSSARY.md ("Verification always auditable"), 06-contact-method.md, 09-data-quality-record.md

## 1. Purpose

A Verification Record is the **immutable, timestamped evidence that a specific claim about
a specific subject was checked by a specific verification provider**. It answers one
question: "at this time, did provider X confirm that attribute value Y is true for subject
Z?" — nothing more.

It exists because the platform's core invariant is "**Verification always auditable**":
every confirmation is a record, never a floating boolean on an entity. Verification never
modifies the subject; it only produces evidence.

## 2. Responsibilities

- Record one verification of one attribute of one subject by one provider.
- Preserve the value snapshot that was verified (so the claim is explainable later).
- Encode the outcome (confirmed / not-confirmed / inconclusive) and provider detail.
- Carry an explicit validity window; evidence expires and prompts re-verification.
- Accumulate into immutable history; re-verification is always a new record.
- Feed Data Quality scoring (09) and duplicate-candidate confidence (07).

## 3. Lifecycle

```
initiated → performed → confirmed / not-confirmed / inconclusive
                        ↘ valid (expires at expiresAt)
                        ↘ expired → (subject to re-verification) → new record
```

- **initiated**: a verification request exists (by a provider, automation, or human).
- **performed**: the provider returned a result.
- **confirmed / not-confirmed / inconclusive**: terminal outcome of this attempt.
- **expired**: the validity window passed. The record stays as history; the *current*
  verification state is derived as "latest non-expired record". Expiration never deletes
  or rewrites history; it only ends validity.
- **Re-verification** produces a **new** record with a fresh window; the old record is
  untouched.

## 4. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| subjectType | code | What kind of subject was verified (entity, contact-method pair, website). |
| subjectId | identifier | The subject's id. |
| attribute | code | What was verified (e.g., email address, phone number, domain, identity, website reachability). |
| valueSnapshot | structure | The exact value as verified — the claim that was tested. |
| provider | reference | Which verification provider performed the check (extensible lookup). |
| providerEvidence | reference | Opaque reference to the provider's raw response, retained per provider policy. |
| outcome | enum | `confirmed`, `not-confirmed`, `inconclusive`. |
| resultDetail | structure | Structured result: deliverability class, error category, provider codes. |
| verifiedAt | timestamp | When the provider performed the check. |
| validFrom | timestamp | Start of the validity window (usually verifiedAt). |
| expiresAt | timestamp | End of the validity window; null = no expiry (rare, policy-governed). |
| purpose | code | Why verification ran (ingestion, re-verification, manual, workflow-triggered). |
| initiatedByType | enum | `user`, `automation`, `workflow`, `provider`. |
| initiatedBy | reference | The initiating actor (User or Automation Job). |
| correlationId | identifier | Ties the record to the originating execution/request. |

## 5. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Verification Record → subject | n : 1 | Weak reference by (subjectType, subjectId); must survive subject changes. |
| Verification Record → Verification Provider | n : 1 | Provider identity via extensible lookup. |
| Verification Record → value claim | n : 1 | If subject is a contact-method pair, the verified claim is the pair's value (per B3/R3, granularity is per-owner + method). |
| Verification Record → Raw Import | n : 1 | Optional evidence anchor: which import the claim came from. |
| Verification Record → Initiator (User / Automation Job) | n : 1 | Auditable initiator. |
| Verification Record → Data Quality Record | 1 : n | These records are the primary evidence inputs to scoring. |

## 6. Validation Rules

- subjectType, subjectId, attribute, provider, outcome, and verifiedAt are required.
- valueSnapshot is required — a verification without the verified value is meaningless.
- `verifiedAt` is authoritative and immutable.
- Only `initiated`/`performed` states can transition; once an outcome is set, the record is
  immutable.
- expiresAt must be later than validFrom when present.
- A record cannot be edited after outcome is recorded — corrections are new records.

## 7. Ownership

The **Data Quality function** owns verification policy (providers, thresholds, windows).
The **initiating actor** owns the specific record. No business workflow owns or mutates
verification evidence.

## 8. State Machine

```
initiated → performed → confirmed (valid → expired)
                      → not-confirmed (valid → expired)
                      → inconclusive (valid → expired)
```

- `initiated`/`performed` are transitional; any of the three outcomes is terminal.
- `valid` vs `expired` is **derived from time** (validFrom/expiresAt), not a stored flip —
  the record itself never transitions after outcome.
- Current state of a subject = derived from the latest valid record; historical records
  remain immutable.

## 9. Retry / Recovery Strategy

- A failed provider call produces no outcome record (or an `inconclusive`), and may be
  retried as a **new initiated record**.
- Expired confirmation does not invalidate the underlying subject; it triggers a new
  verification cycle under policy.
- Provider outages are handled at the provider-policy level: a bounded backoff window,
  then a fresh verification attempt, never a rewrite of a past record.

## 10. Security

- valueSnapshot may contain PII (an email/phone); access follows the data-governance and
  anonymization policy — see P7 in DATABASE_REVIEW.md: snapshots are a known PII surface.
- Provider evidence may be license-constrained; access is role- and provider-restricted.
- Verification cannot be fabricated by business code: records are created only by the
  verification enforcement layer.
- Records are immutable; tampering is detectable and reportable (Audit Log §8).

## 11. Audit Requirements

- Verification records are themselves part of the audit story (they prove a claim was
  checked), but they are **not** Audit Log entries — the *action* of verifying is logged in
  the Audit Log with this record's id as its outcome reference.
- Initiation, outcome, and re-verification cycles are traceable via correlationId and the
  initiator reference.
- The "Verification always auditable" invariant means: for every verification record there
  is a matching audit action, and vice-versa.

## 12. AI Interaction

- AI never writes, edits, or deletes verification records.
- AI may *recommend* what to re-verify or flag an expired claim — as an insight event.
- AI-generated insights must only cite *existing* verification evidence; AI cannot claim
  something was verified when it was not.

## 13. Workflow Interaction

- Verification is a workflow step (after ingestion, before entity promotion, or on a
  re-verification schedule).
- Verification outcomes are domain events: `confirmed` may unlock promotion; `expired`
  may schedule re-verification.
- Workflows consume verification state for decisions but never mutate records.

## 14. Scalability

- Verification volume is high (many claims re-checked over time); history accumulates
  intentionally — immutability is the design, not an accident.
- Current state is derived, so hot queries target the latest valid record; old records are
  archival candidates.
- Multiple providers are supported as a lookup; provider-specific response shapes are
  captured in providerEvidence, keeping the record provider-agnostic.

## 15. Index Strategy

- `(subjectType, subjectId)` + time: full history of one subject's claims.
- `(subjectType, subjectId, attribute)`: latest-valid derivation per attribute.
- `provider` + time: provider reliability analysis.
- `expiresAt`: re-verification scheduling sweep.
- `correlationId`: end-to-end reconstruction.

## 16. Future Extensions

- Continuous verification: scheduled re-verification per attribute class becomes a
  policy-driven loop over `expiresAt`.
- Provider marketplace: new providers register via lookup; no schema change.
- Cross-provider adjudication: conflicting provider results become a distinct reviewable
  case, modeled as a new verification context over the existing immutable records.
- Value-pair granularity: verifying "email X belongs to person P" vs "email X is
  deliverable" are two attribute codes of the same record structure.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Verification/Confidence records.
- Directly addresses B3/R3: verification granularity is defined at the (owner, method)
  pair level, which the Contact-Method ownership decision (B3) must now mirror.
- Satisfies GLOSSARY.md: "Verification always auditable" via immutable records + audit link.
- Honors DATABASE_REVIEW.md P7: valueSnapshot is flagged as a PII surface to govern.

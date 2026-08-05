# 05 — Raw Import

Status: Draft v1.0 (Phase 4.2)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, MASTER_ARCHITECTURE.md §3 (Data Flow: Raw Import → Normalization), 03-import-source.md, 04-search-job.md, 06-search-execution.md

## 1. Purpose

A Raw Import is the **immutable, byte-faithful capture of everything a source delivered**:
the exact payload exactly as received, before any normalization, cleaning, or interpretation.
It is the provenance anchor of the platform: every business entity eventually derives from
one or more Raw Imports, and every Raw Import traces back to its Import Source.

It exists because the platform's trust model ("know who said what") requires that no
information is ever lost or rewritten in transit. Normalization may transform data into
business entities, but the original evidence must always be recoverable verbatim.

## 2. Responsibilities

- Preserve the original payload exactly, byte-for-byte, in the provider-native structure.
- Record when it arrived, from which source, under which execution, and with which
  provider-side identifiers.
- Provide an integrity fingerprint so the captured payload can be proven unmodified.
- Anchor provenance for the business records created from it.
- Feed the ingestion pipeline state without ever altering the captured payload.

## 3. Lifecycle

```
captured (immutable) → referenced by pipeline processing → retained (provenance)
```

- **Captured**: written once at receipt. From this moment the payload and its metadata are
  immutable.
- **Processed**: downstream stages (normalization, dedupe, entity creation, verification)
  reference this import; they do not modify it. Progress is recorded in child processing
  records and provenance links.
- **Retained**: kept under retention policy as the evidence record for everything derived
  from it.

There is no update path for the payload. Corrections happen downstream as new normalized
state, never by rewriting what the source said.

## 4. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| source | reference | The Import Source that delivered the payload. |
| searchExecution | reference | Optional; the Search Execution that triggered this import, when it came from a search job. |
| providerMessageId | text | Provider-side identifier(s) of the delivered payload, when available. |
| receivedAt | timestamp | Authoritative time of capture. |
| format | lookup | Provider-native envelope/content format; extensible vocabulary to support any provider. |
| payload | payload | The exact original payload, preserved verbatim in provider-native structure. |
| contentHash | fingerprint | Integrity fingerprint computed at capture; proves the payload is unmodified. |
| payloadSize | metric | Size of the captured payload. |
| recordCount | metric | Number of discrete records the source claims are in the payload (may differ from validated count). |
| correlationId | identifier | Ties the capture to its originating request/execution. |

## 5. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Raw Import → Import Source | n : 1 | Every import is attributed to exactly one source. |
| Raw Import → Search Execution | n : 1 | Optional trigger; a search execution produces many imports. |
| Raw Import → Processing record | 1 : n | Child records track normalization/ingestion progress without mutating the import. |
| Raw Import → Business entities | 1 : n | Provenance links from entities back to the imports that evidence them. |
| Raw Import → Data Quality evidence | 1 : n | Verification/confidence evidence may cite the source import. |

## 6. Validation Rules

- source is required and must be `active` at capture time (with documented exception for
  retention of history from later-retired sources).
- payload is required and stored exactly as received; no field-level validation applies to
  the payload itself (validation happens downstream).
- contentHash is computed at capture and is immutable.
- receivedAt cannot be backdated by business workflows.
- A raw import may only be created; it can never be edited or replaced.

## 7. Ownership

The **Import Source** is the accountable owner of its raw imports. The Search Execution
owns the request context; the source owns the evidence. Operational ownership of the
retention/archival of raw imports belongs to the platform data-governance function.

## 8. State Machine

Raw Import itself has **no mutable state** — it is a single-state entity (captured).

Ingestion progress is the state machine of its child **processing records**:

```
pending → normalizing → normalized / failed
                    ↘ rejected (non-conforming, evidence retained)
```

- `normalized`: the payload was processed into one or more business records; provenance
  links exist.
- `rejected`: the payload was evaluated and intentionally not materialized (e.g., outside
  scope); the evidence is still retained.
- `failed`: processing errored; the payload remains intact for a later attempt.

The child processing state can move; the payload never does.

## 9. Failure Handling

- A failed processing attempt leaves the payload fully intact and immutable.
- Failure context (stage, error category, correlation) is recorded on the processing
  record, not on the import.
- The evidence remains available so the same payload can be retried or manually reviewed.
- Provider-side duplicates (same providerMessageId + contentHash) are recognized at capture
  and logged, never double-processed.

## 10. Retry Strategy

- Retries re-run **processing**, never re-capture the payload.
- Retry is bounded by the processing policy and is idempotent: re-processing the same
  contentHash must not create duplicate business records.
- A retry may be triggered by schedule, by the owning Search Execution, or by an operator;
  each attempt is a new processing record referencing the same raw import.

## 11. Data Retention

- Raw Imports are retained at least as long as any business entity derived from them,
  because provenance must survive.
- Retention windows are governed by data-governance policy; archival preserves the exact
  payload and hash for recoverability.
- An import may only be removed when no provenance or evidence reference remains (a rare,
  policy-driven case).

## 12. AI Interaction

- AI never creates, edits, or deletes raw imports.
- AI consumes imports as **input only**, downstream of capture.
- AI-generated insights must cite the raw imports (and thus sources) that evidence them,
  preserving "who said what".

## 13. Workflow Interaction

- Import receipt is a domain event; workflows react (e.g., "new data from source X
  arrived → run verification on affected entities").
- Workflows never mutate payloads; they trigger processing, verification, and review.
- Workflow-triggered re-processing is a retry of an existing import, never a rewrite.

## 14. Security

- Payloads may contain provider data subject to license; access follows the source's
  license policy and role restrictions.
- contentHash supports tamper detection: a mismatch proves the capture was altered.
- Immutability is a hard platform constraint, enforced by the capture layer.
- Payloads are not treated as executable content; they are data, processed only through
  the validated normalization pipeline.

## 15. Index Strategy

- `source` + `receivedAt`: per-source time-ordered view.
- `contentHash`: capture-time dedupe of identical payloads.
- `providerMessageId`: provider-side correlation and re-delivery detection.
- `searchExecution`: reconstruct everything an execution produced.
- Provenance lookups from entities back to their evidence imports.

## 16. Future Scalability

- Provider support is open-ended: `format` and payload-as-structure mean new providers need
  no schema change, only a new format vocabulary entry and a normalization handler.
- High ingestion volume is absorbed by append-only capture; business queries never scan
  raw payloads directly.
- Archival tiers can move old evidence off the hot path while keeping the fingerprint and
  provenance references online.
- Streaming providers map to the same entity: each delivered batch is a raw import.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Raw Import.
- Implements MASTER_ARCHITECTURE.md §3: Raw Import is the fixed, trustworthy first stage.
- Satisfies 03-import-source.md provenance invariant; "any provider" is honored via open
  format vocabulary and untouched payload storage.

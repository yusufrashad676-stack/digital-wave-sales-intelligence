# 03 — Import Source

Status: Draft v1.0 (Phase 4.1)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, MASTER_ARCHITECTURE.md §3 (Data Flow: Raw Import), GLOSSARY.md (Import Source)

## 1. Purpose

Represents a **provenance origin**: where researched data came from. Every raw record
entering the platform is attributed to an Import Source, so trust, licensing, and quality
can be assessed per origin and per record.

The Import Source is a first-class entity because the platform's value depends on knowing
**who said what**, not just what was said. It is the anchor of the Raw Import → Normalization
→ Dedupe → Verification pipeline described in MASTER_ARCHITECTURE.md §3.

## 2. Responsibilities

- Identify a data origin (provider, public web source, file upload, or integration).
- Carry the licensing/usage policy and the trust posture of that origin.
- Anchor provenance for all raw imports attributed to it.
- Support operational controls: active/paused/retired states and usage policy limits.
- Feed data-quality scoring with per-origin reliability context.

## 3. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| name | text | Human-readable source name. |
| kind | lookup | Source category (licensed provider, public web source, file upload, integration). Extensible vocabulary, not a fixed enum. |
| providerReference | text | External provider/contract reference, if any. |
| license | structure | Usage and licensing constraints recorded for this origin. |
| reliabilityProfile | structure | Rated/derived trust posture (e.g., tier, observed quality); advisory, re-evaluated over time. |
| status | state | `active`, `paused`, `retired` (see Lifecycle). |
| usagePolicy | structure | Volume/rate/scope limits applying to this origin. |
| contactOwner | reference | Team/user accountable for the relationship with this origin. |
| createdBy / createdAt | audit | Who registered this source and when. |
| updatedAt | timestamp | Last mutation. |
| deletedAt | timestamp | Soft-delete marker (rarely used; see 7). |

Credentials, tokens, and connection secrets for integrations are **not** stored here; they
live in the secrets management facility under SECURITY.md and are referenced only as
opaque identifiers.

## 4. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Import Source → Raw Import | 1 : n | Every raw import points at its source. |
| Import Source → Search Job (usage) | n : m | A search job draws on one or more sources; a source is used by many jobs. |
| Import Source → Provenance references | 1 : n | Records created/contributed from this source retain a weak provenance link (source id) even after normalization. |
| Import Source → Data Quality | 1 : n | Per-source reliability evidence accumulated over time. |
| Import Source → Contact Owner (User) | n : 1 | The accountable owner of the source relationship. |

## 5. Lifecycle

```
created → active ⇄ paused → retired
```

- `created`: registered but not yet producing data.
- `active`: records from this source are imported and processed.
- `paused`: ingestion suspended; existing records remain valid and attributed.
- `retired`: source no longer produces data; history preserved in full.

Retirement is the terminal operational state. A retired source may be re-registered as a
new source record if the relationship is re-established.

## 6. Validation Rules

- name is required and unique (in canonical form).
- kind must come from the source-kind vocabulary.
- A license/usage policy is required before the source becomes `active`.
- A source cannot be `active` without a defined usagePolicy.
- Status transitions follow the lifecycle; retirement is irreversible in the same record.
- No secrets may be stored in this entity; only opaque credential references.

## 7. Soft Delete Strategy

Soft delete (`deletedAt`) exists but is exceptional. Provenance is the governing rule:
**raw imports, provenance references, and quality history must outlive the source**. The
normal terminal state is `retired` with full retention. True deletion only occurs before a
source has produced any raw imports and no provenance references exist.

## 8. Audit Requirements

- Source registration, activation, pause, retirement, and usage-policy changes are audited.
- Reliability profile re-evaluations are audited (who/what changed the trust posture and why).
- Credential rotation for a source is an audited, privileged event.

## 9. Index Strategy

- `name`: canonical uniqueness and lookup.
- `kind`: category-level queries and reporting.
- `status`: which sources are active/paused/retired.
- Provenance lookups by source across raw imports and records.
- Data-quality evidence by source over time.

## 10. Future Scalability

- Large numbers of sources require per-source policy without schema changes per source
  (usage policy as structure, not columns).
- Marketplace of third-party data providers can be modeled as Import Source entries with
  contract/license references.
- Rate and volume controls must be enforceable per source without coupling to the import
  engine internals.
- Aggregated provenance queries (all records from a source) must stay efficient at scale.

## 11. AI Interaction

- AI never creates, activates, pauses, or retires sources.
- AI may propose reliability re-evaluation ("this source's data shows consistent
  confirmation") as an insight event; a human approves changes to the reliabilityProfile.
- AI-generated insights must record the underlying sources so the insight itself is
  attributable to origin.

## 12. Workflow Interaction

- Source state changes (e.g., source paused due to license expiry) can trigger workflows:
  re-verify affected records, notify owners, re-run pending search jobs.
- Workflows never modify source policy; they react to source lifecycle events.
- Import and enrichment workflows read source kind/usagePolicy to decide processing rules.

## 13. Security Considerations

- Secrets/credentials never stored here; only opaque references into secrets management.
- License/contract data is access-restricted; not every role reads commercial terms.
- Usage policy is enforced, not advisory: exceeded limits are an audited event.
- Provenance links prevent source manipulation from laundering data ("a different source
  said this") — attribution is immutable.
- Retired/paused sources cannot be silently reactivated; state changes are gated and audited.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Import Source.
- Precedes the Raw Import design (Phase 4.2): this entity is its parent and anchor.
- Follows GLOSSARY.md: provenance and "know who said what" is a core invariant.

# ADR-008 — Spatial Index Strategy

## 1. Status

**Accepted** (DATABASE DESIGN FREEZE v1.0)

## 2. Context

Addresses carry a latitude/longitude pair (decision 12). The design mandates spatial
indexing for proximity queries (e.g., "companies near me", dedupe of nearby addresses).
Two candidate mechanisms existed: PostGIS (`geography` + GiST index) and geohash (btree
prefix). Adding PostGIS is a substantial dependency and migration burden that v1 does not
require.

## 3. Problem

Choosing PostGIS up front forces a heavy extension dependency (and its own SQL migration
and operational surface) before any proximity feature actually ships; choosing geohash
locks in a lower-precision approach that would be hard to upgrade. Either way, the domain
model must not be coupled to the mechanism.

## 4. Decision

1. **Version 1 stores latitude/longitude as plain numeric values only** — no spatial type,
   no PostGIS dependency, no geohash column.
2. **Proximity queries in v1** are handled by simple bounded lat/lng range predicates
   (box filtering) backed by ordinary composite btree indexes.
3. **Future versions may adopt PostGIS** (converting lat/lng to `geography` + GiST) —
   **without changing the domain model**: the domain object always carries lat/lng;
   the storage representation and index mechanism are infrastructure concerns.
4. If PostGIS is adopted, its activation is an ADR-005-style SQL migration on top of the
   frozen schema.

## 5. Alternatives Considered

- **PostGIS `geography` + GiST now** — deferred: heaviest correct option; no v1 feature
  justifies the dependency; adoption later is a storage change, not a model change.
- **Geohash + btree prefix now** — rejected: fixed precision, extra generated column,
  and a future migration back to a real spatial type; the precision trade-off is not
  needed in v1.
- **No spatial indexing (full scan)** — rejected: unbounded cost once address volume
  grows; the lat/lng range predicate keeps a v1-indexed path.

## 6. Consequences

- Lat/lng remain plain values; the both-or-neither validation rule (03-address.md) is
  unchanged.
- Proximity precision in v1 is approximate (degree-range bounding boxes) — acceptable
  for the v1 feature set.
- The upgrade path to PostGIS is documented and non-breaking: values move into a spatial
  column; the domain and API never expose the storage type.
- ADR-005's SQL-migration mechanism is the carrier if/when spatial activation happens.

## 7. Trade-offs

- **Pro:** zero heavy dependency in v1; domain purity preserved; upgrade is a contained
  infrastructure migration.
- **Con:** v1 proximity queries are lower precision (bounding box, not true distance);
  some v1 code will be replaced when PostGIS lands.

## 8. Future Revisions

- Adopt when a genuine proximity feature ships (e.g., "nearby companies", geospatial
  dedupe) — evaluated against the frozen ADR-005 mechanism.
- Revisit geohash only if a fully offline/edge deployment without PostGIS becomes a goal.

---

Related: 03-address.md, ADR-005; blocking B6 in DATABASE_REVIEW.md.

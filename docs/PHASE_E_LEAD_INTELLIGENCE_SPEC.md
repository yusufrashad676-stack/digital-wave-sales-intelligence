# PHASE E — LEAD INTELLIGENCE ACTIVATION SPECIFICATION (E0)

Status: **SPECIFICATION ONLY — awaiting approval. Nothing implemented.**
Approved Phase E scope: E1 Read Path · E2 Lead Persistence · E3 Lead Re-enrichment · E4 Frontend Activation · E5 Tests + Audit · E6 Production.
AI/Gemini is **NOT** part of Phase E (next phase, per `docs/handoff/AI_PRODUCT_SPEC.md`).

Legend used throughout: **[CURRENT]** = exists today · **[PROPOSED]** = designed here · **[REQUIRED]** = must ship in Phase E · **[OPTIONAL]** = may ship, may defer · **[OUT OF SCOPE]** = must not ship.

---

## 1. Executive Summary

Phase D delivered a backend enrichment engine (website metadata, social discovery, social verification) writing
snapshots onto `SearchResult` rows. **The product cannot see it.** The audit found five gaps, three of them
more serious than the proposal assumed:

1. **No read path** — once `POST /search/executions/:id/enrich` returns, there is no GET endpoint to retrieve
   results with enrichment. Enrichment data is write-only.
2. **Lead save drops enrichment** — `SaveLeadInput`/`LeadSnapshot` have no enrichment fields; the sales object
   loses all digital-presence evidence.
3. **The frontend never uses the discovery pipeline** — `SearchView` calls legacy `POST /api/v1/search`
   (raw provider search, no qualification, no executionId, no enrichment). The one-click run flow
   (`POST /search/runs`) with qualification exists only in the backend and in the smoke tests.
4. **`requalifyWithEnrichment` is dead code** — implemented and unit-tested in D5
   (`qualification-filter.ts:69`) but called by nothing. Enrichment never requalifies results.
5. **Tenant-isolation gap in the existing enrich endpoint** — `SearchExecution.createdById` is **never set**
   (`prisma-search-execution.repository.ts:16` omits it), and `EnrichSearchResultsUseCase` skips the ownership
   check when `createdById === null` (`enrich-search-results.usecase.ts:78`). Today **any authenticated user can
   enrich any execution**. Ownership must be resolved through `SearchJob.userId`.

Phase E closes all five: read APIs with recomputed qualification, snapshot copy into Leads, lead re-enrichment
reusing a shared engine, and a frontend that finally runs the real pipeline. One additive migration
(3 columns + 2 indexes on `leads`), three new endpoints, one security fix, no new external services.

---

## 2. Current-State Audit

### 2.1 Backend modules [CURRENT]

| Module | Files (src/spec) | Status |
|---|---|---|
| `auth` | 31 / 10 | Full JWT + refresh rotation + RBAC |
| `search` | 46 / 16 | Discovery + qualification + enrichment + history |
| `leads` | 14 / 8 | Save/list/get/update/soft-delete, no enrichment awareness |
| `health` | 4 / 0 | DB ping |
| 12 others | 1 each (module.ts) | Empty scaffolds |

### 2.2 Data model [CURRENT]

- `SearchExecution` — `status`, `metrics` (JSON, merged by `updateExecutionMetrics`), `jobId`, **`createdById` always NULL** (never written by `createExecution`).
- `SearchResult` — full business fields + `ordering`, `verificationStatus`, **`enrichmentStatus` / `enrichmentSnapshot` (JSONB) / `enrichedAt`** (Phase D migration `20260817000000`), soft delete. **No persisted qualification** — qualification is computed at run time only.
- `Lead` — user-owned snapshot-by-design ("Business fields are copied at save time…" — schema comment). Idempotent save with soft-delete restore (ADR-005); partial unique index `(user_id, provider_record_id) WHERE deleted_at IS NULL`. **No enrichment fields.**
- `SearchJob` — has `userId` + `filters` (JSON, **includes the parsed `intent`** with criteria) — this is the ownership anchor and the criteria source for recomputation.
- `EnrichmentStatus` enum: `PENDING | IN_PROGRESS | ENRICHED | PARTIALLY_ENRICHED | ENRICHMENT_FAILED | SKIPPED`.

### 2.3 Enrichment flow [CURRENT]

`POST /api/v1/search/executions/:executionId/enrich` → `EnrichSearchResultsUseCase.execute()`:
loads execution (status must be `COMPLETED`), `resetStaleInProgress`, filters results to
`PENDING | ENRICHMENT_FAILED`, batches (default 5, 100ms delay), per result: website port → social discovery →
social verification → builds `EnrichmentSnapshot { website?, social?, errors?, enrichedAt, enrichmentVersion: 1 }`
→ `updateEnrichmentStatus(id, finalStatus, snapshot)`. Summary metrics merged into `execution.metrics`.

Snapshot shape (`enrichment-snapshot.ts`): `website: { title, description, techHints[], socialLinks[], fetchedAt, provider }`,
`social: { profiles: [{ platform, handle, profileUrl, confidence, verified }], discoveredAt, provider }`,
`errors: [{ type, message, provider }]`.

- **Locks:** `acquireEnrichmentLock`/`releaseEnrichmentLock` are **no-ops and never called** (`prisma-enrichment.repository.ts:127`). The only concurrency protection is `resetStaleInProgress` + the status filter.
- **Requalification:** never invoked (see §1 item 4).
- **`updatedById`** is not set by `updateEnrichmentStatus` (minor audit-trail gap, noted, not fixed in E).

### 2.4 Discovery flows [CURRENT]

- `POST /search/runs` (`RunDiscoveryUseCase`) — Arabic intent → provider pages → normalize → persist (Job/Execution/RawImport/Results atomically per page) → `qualifyResults` (in-memory) → returns `executionId` + per-result `qualification` + summary. **Qualification is never persisted.**
- `POST /search` (`SearchCompaniesUseCase`) — legacy provider search; **also persists executions/results**; no qualification. This is what the frontend uses today.
- `GET /search/history` — job-based items (`query, filters, status, resultCount, executedAt, createdAt`); **no `executionId`** → the UI cannot navigate from history to results.
- Both writes set `SearchJob.userId`; neither sets `SearchExecution.createdById`.

### 2.5 Leads flow [CURRENT]

`POST /leads` (idempotent; restore-on-resave resets status/notes), `GET /leads`, `GET /leads/:id`,
`PATCH /leads/:id` (status/notes), `DELETE /leads/:id` (soft). Ownership via `userId` column on every query — solid.
DTO/client (`SaveLeadPayload`) round-trips business fields **posted by the client**; server trusts them (no server-side
source verification today). Response envelope `{ data }`, lists `{ data, meta: { count } }`. No pagination anywhere
(history has `limit` only).

### 2.6 Frontend [CURRENT]

React 19 + Vite SPA, hand-rolled router, plain CSS (1453-line `index.css`), Arabic UI, no state library, no tests.
Views: SignIn, Workspace (shell), SearchView (**legacy endpoint**), RecentSearchesView (rerun only),
SavedLeadsView, LeadsPipelineView (kanban, no DnD), SettingsView, ResultDrawer, LeadCard, icons.
API layer: `requestJson` with 401 auto-refresh; `api/{auth,search,leads,search-options}.ts`.
**Zero references to runs/executions/enrichment anywhere in `frontend/src`.**

### 2.7 Conventions verified [CURRENT]

- Envelopes: success `{ data }` (+ `meta.count` for lists); errors `{ error: { code, message, details? } }` via global filter.
- Error codes: `RESOURCE_NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `VALIDATION_ERROR`, `ENRICHMENT_*` (3) exist. No `ENRICHMENT_IN_PROGRESS` code.
- Controllers: parse via DTO → exactly one use-case → return. No try/catch. Global guards (Auth, Throttler, Roles); `ParseUUIDPipe` used by enrich controller.
- Soft delete: `deletedAt IS NULL` filters on every read path; partial unique indexes per DATABASE_RULES.md.
- Tests: Node test runner via `tsx --test`, colocated `*.spec.ts`, stubbed ports injected; 382 passing. Frontend: no runner installed.
- Migrations: 9, `YYYYMMDDHHMMSS_name`; never `db push`; additive-only preferred.
- Module boundaries: `domain`/`application` import no `@nestjs/*`/`@prisma/client`; cross-module access only via module `exports`.

### 2.8 Production smoke evidence [CURRENT]

Aug 17 run: 20 Dublin results → enrich → `PARTIALLY_COMPLETED`, 19 enriched, 50 social profiles found, 0 verified
(platform bot-blocking is real), **30,135 ms** — essentially at the Vercel `maxDuration: 30` ceiling. Design consequence: execution-level enrich stays one synchronous request (unchanged), single-lead enrich (E3) is safely fast, polling is unnecessary.

---

## 3. Architecture Findings (numbered, referenced below)

| # | Finding | Severity | Consequence for E |
|---|---|---|---|
| F-1 | No read API for execution + results incl. enrichment | Blocker for product | E1 builds it |
| F-2 | Lead save drops enrichment | Blocker for product | E2 copies it server-side |
| F-3 | Frontend on legacy `/search`; runs/qualification invisible | Blocker for product | E4 migrates the flow |
| F-4 | `requalifyWithEnrichment` dead code | Functional gap | E1 makes it live via read-time recomputation |
| F-5 | Execution ownership unenforced (`createdById` always NULL, null-bypass check) | **Security** | E1 fixes ownership via `job.userId` (REQUIRED, incl. tightening the existing enrich endpoint) |
| F-6 | Enrichment locks are no-ops and unused | Accepted by design | E3 uses DB-atomic conditional status transitions instead |
| F-7 | Qualification never persisted | Design choice to keep | E1 recomputes (pure function) — no new columns |
| F-8 | History lacks `executionId` | UX gap | E1 adds it to history DTO |
| F-9 | `errors[].message` in snapshots may carry internal provider text | Info-leak risk | E1/E2 expose curated projections only |
| F-10 | Snapshot URL/text fields are externally sourced | XSS-ish risk | `profileUrl` is rebuilt from platform templates (scheme-safe by construction); title/description rendered as text (React-escaped); E4 forbids `dangerouslySetInnerHTML`; E1 scheme-validates all exposed URLs at serialization |
| F-11 | Execution-level enrich takes ~30s (Vercel ceiling) | Capacity note | No polling, no auto-enrich in E |
| F-12 | `ROADMAP_CURRENT.md` still says "E = AI/Gemini" | Doc conflict | Doc-only update in E6 (this approval overrides) |

---

## 4. E1 — Read Path

### 4.1 Endpoints [PROPOSED — REQUIRED]

```
GET /api/v1/search/executions/:executionId         → execution detail (+ summary)
GET /api/v1/search/executions/:executionId/results  → ordered result rows w/ qualification + enrichment
```

Both: default auth (no `@Public()`), `ParseUUIDPipe`, one use-case each, `{ data }` envelope.

**Ownership [REQUIRED]:** resolve `SearchExecution → SearchJob.userId`; require `job.userId === principal.userId`
(403 `FORBIDDEN` otherwise). Do **not** rely on `execution.createdById` (F-5). Executions whose job cannot be
resolved → 404 `RESOURCE_NOT_FOUND` (do not reveal existence).

**REQUIRED sibling fix (behavior-affecting, flagged for approval):** apply the same `job.userId` ownership rule to
the existing `POST :executionId/enrich` (`enrich-search-results.usecase.ts:78-80`), closing F-5. This tightens a
currently-open hole; it is the only Phase D behavior change in E and is security-motivated.

### 4.2 `GET /executions/:id` response [PROPOSED]

```
data: {
  executionId, jobId, status,                       // execution status enum
  query,                                            // from job
  createdAt, finishedAt,
  summary: {                                        // recomputed live from result rows
    total, qualified, rejected, unverifiedSocial,   // post-enrichment qualification counts (§4.4)
    enrichment: { pending, inProgress, enriched, partiallyEnriched, failed, skipped,
                  websiteFound, socialProfilesFound, socialProfilesVerified }  // from countByEnrichmentStatus + metrics
  }
}
```

Stale execution state representation: `summary` is **always recomputed from rows**, so a client re-fetching after
enrichment sees current truth; `execution.metrics` (write-time) is **not** returned except the two duration fields
(`enrichmentDurationMs`) — single source of truth for display is the recomputed summary.

### 4.3 `GET /executions/:id/results` response [PROPOSED]

Paginated? **No** — executions are bounded (≤ `SEARCH_MAX_RESULTS` ≈ 20 by default; safety pages ≤ 3).
Returns all rows, `orderBy ordering ASC` (existing index `idx_search_results_execution_id_ordering`), soft-deleted
rows excluded.

```
data: [{
  resultId, providerId, providerRecordId, companyName, category, address, area, phone,
  email, website, rating, ratingCount, sourceUrl, verificationStatus, retrievedAt,
  qualification: { status, reason, website: {requested, observed, source}, social: {…} },  // §4.4
  enrichment: {
    status,                        // EnrichmentStatus
    enrichedAt,                    // ISO | null
    website: { title, description, techHints[], socialLinks[] } | null,   // curated; no fetchedAt/provider
    social: { profiles: [{ platform, handle, profileUrl, confidence, verified }] } | null
  } | null                          // null ⇔ status PENDING
}], meta: { count }
```

- Empty state: execution with zero results → `{ data: [], meta: { count: 0 } }` (honest empty, no error).
- Errors mapping: 401 `UNAUTHORIZED` (guard), 403 `FORBIDDEN` (not owner), 404 `RESOURCE_NOT_FOUND`
  (unknown UUID / soft-deleted), 400 `VALIDATION_ERROR` (non-UUID).
- `errors[]` from snapshots are **not** exposed (F-9). Curated projection only — raw JSONB never passed through (Design Q5).

### 4.4 Qualification: recomputed live [PROPOSED — REQUIRED]

- Load criteria from `job.filters.intent.criteria` (persisted at run time).
- `qualifyResults(rows, criteria)` → discovery-level qualification (existing pure function).
- If `row.enrichmentSnapshot` exists → `requalifyWithEnrichment(result, snapshot)` (existing pure function —
  **makes D5 live without touching the enrich write path**).
- Answer to "live or persisted": **live**. Rationale (Q6): qualification is a pure function of persisted inputs;
  persisting it would add a column, a write-path change inside Phase D behavior, and a divergence risk.
  Tradeoff accepted: recomputation cost per request is trivial (≤ 20 rows, pure functions).

### 4.5 New repository capabilities [PROPOSED]

Extend `EnrichmentRepository` port (owned by search module):
- `findExecutionDetail(executionId): Promise<{ execution, job: { userId, query, filters } } | null>` — join through `jobId`.
- `findFullResultsByExecutionId(executionId)` — like `findResultsByExecutionId` but selecting all display fields (`EnrichmentResultRow` today returns only 8 fields).
- Existing `countByEnrichmentStatus` reused for summary.

### 4.6 History change [PROPOSED — REQUIRED for E4 navigation]

`SearchJobHistoryItem` + `search-history.dto.ts` + `prisma-search-job.repository.ts`: add `executionId`
(latest execution id, already selected implicitly — add `id` to the `executions` select). Additive; old clients unaffected.

---

## 5. E2 — Lead Persistence

### 5.1 Schema change [PROPOSED — REQUIRED, single additive migration]

```sql
-- Conceptual; actual SQL generated by `prisma migrate dev`, reviewed before `migrate deploy`
ALTER TABLE "leads" ADD COLUMN "enrichment_status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "leads" ADD COLUMN "enrichment_snapshot" JSONB;              -- nullable
ALTER TABLE "leads" ADD COLUMN "enriched_at" TIMESTAMPTZ(3);             -- nullable
CREATE INDEX "idx_leads_enrichment_status"        ON "leads" ("enrichment_status");
CREATE INDEX "idx_leads_user_id_enrichment_status" ON "leads" ("user_id", "enrichment_status");
```

**Enum reuse analysis (Q from brief):** safe. `EnrichmentStatus` is a global Postgres enum type; sharing one enum
across tables is standard and the six values map exactly onto lead-enrichment lifecycle semantics. No new enum, no
value drift risk, no rename (renaming enum values is breaking — avoided). Existing rows backfill to `PENDING`,
which is truthful (they were never enriched).

Prisma side: `Lead` model gains `enrichmentStatus EnrichmentStatus @default(PENDING) @map("enrichment_status")`,
`enrichmentSnapshot Json? @map("enrichment_snapshot")`, `enrichedAt DateTime? @db.Timestamptz @map("enriched_at")`
+ the two `@@index` entries, per DATABASE_RULES naming (`idx_leads_*`).

### 5.2 Copy model — server-side at save [PROPOSED — REQUIRED]

**Decision (Design Q1–Q3):** Lead owns a **copied** snapshot (consistent with Lead's snapshot-by-design schema
comment). Referencing `SearchResult` was rejected: results are execution-scoped, re-runnable evidence rows with no
retention guarantee; a cross-module FK would couple user objects to the search lifecycle and break on re-runs/soft deletes.
Copy-at-save is correct: stable lead intelligence + explicit staleness (`enrichedAt`) + E3 refresh.

**Anti-tampering rule [REQUIRED]:** the client never posts snapshot content. `SaveLeadDto` gains one OPTIONAL field:
`searchResultId?: UUID`. When present, the backend loads that `SearchResult` (owner-checked: result → execution →
job.userId === principal), verifies it matches the posted `providerRecordId`, and copies
`enrichmentStatus/enrichmentSnapshot/enrichedAt` server-side. When absent or the result is `PENDING` → lead stays
`PENDING`/null. `IN_PROGRESS` source → treated as not-enriched (copy nothing).

Cross-module read: define `EnrichedSearchResultReader` port in **leads/domain/ports**, implemented in
**leads/infrastructure** via `PrismaService` reading `search_results` joined to `search_jobs` (infrastructure may
query shared tables; no deep imports into search module code). Logged as Decision D-04 (§20).

**Restore path:** re-save after soft delete restores enrichment columns like other business fields only when a
`searchResultId` is provided and resolves to enriched data; otherwise cleared to `PENDING` (a restore is a fresh save).

### 5.3 Lead GET/list changes [PROPOSED — REQUIRED]

`LeadSnapshot` + `LeadResponseDto` + `savedLeadToResult`-equivalents gain:

```
enrichment: { status, enrichedAt, website: {title, description, techHints[], socialLinks[] } | null,
              social: { profiles: [{platform, handle, profileUrl, confidence, verified}] } | null } | null
```

Same curated projection as E1 (§4.3) — one serializer helper shared conceptually; since leads and search are
different modules, each module maps its own DTO from the same stored snapshot shape (mapping is trivial; no
cross-module import needed).

Status semantics surfaced to UI (from `enrichmentStatus`): no enrichment (`PENDING`/`SKIPPED`), pending (`IN_PROGRESS`),
enriched (`ENRICHED`), partially (`PARTIALLY_ENRICHED`), failed (`ENRICHMENT_FAILED`) — all six handled explicitly.

---

## 6. E3 — Lead Re-enrichment

### 6.1 Endpoint [PROPOSED — REQUIRED]

```
POST /api/v1/leads/:leadId/enrich        body: { skipWebsite?: boolean, skipSocial?: boolean }   // both default false
→ 200 { data: { leadId, enrichment: {…same projection…}, durationMs } }
```

Auth default; `ParseUUIDPipe`; owner-only via existing `findOwned(userId, leadId)` semantics (404 on
unknown/not-owned — consistent with the rest of leads).

### 6.2 Reuse strategy (Design Q7/Q8) [PROPOSED — REQUIRED]

- **Extract** the single-result logic from `EnrichSearchResultsUseCase.enrichSingleResult`
  (`enrich-search-results.usecase.ts:183-316`) into a shared application service
  `search/application/services/enrichment-engine.ts` — pure orchestration over the three existing ports, same
  inputs/outputs, **behavior-preserving**. `EnrichSearchResultsUseCase` delegates to it; all 20 existing D-tests
  must stay green unchanged (regression gate).
- **New** `EnrichLeadUseCase` (leads module) consumes `EnrichmentEngine` via `SearchModule` exports
  (`search.module.ts` adds engine to `exports`). No deep imports (boundary rule respected).
- New use-case rather than parameterizing the execution use-case: different aggregate (Lead vs Execution),
  different ownership model, different persistence calls — forcing them into one use-case couples the modules.

### 6.3 Status transitions & concurrency (Design Q9/Q10) [PROPOSED — REQUIRED]

State machine on `Lead.enrichmentStatus`:

```
PENDING ─┬─→ IN_PROGRESS ──→ ENRICHED | PARTIALLY_ENRICHED | ENRICHMENT_FAILED | SKIPPED
FAILED ──┘        ↑ (also from ENRICHED/PARTIALLY_ENRICHED — re-enrich refreshes)
```

- **Atomic claim (no distributed lock — F-6 honestly accepted):**
  `updateMany({ where: { id, userId, deletedAt: null, enrichmentStatus: { not: 'IN_PROGRESS' } }, data: { enrichmentStatus: 'IN_PROGRESS' } })`.
  `count === 0` → row is missing/not-owned (`404`) or already `IN_PROGRESS` (`409 CONFLICT`, code `CONFLICT`,
  message "Enrichment already in progress"). Single-row atomic UPDATE = real mutual exclusion for this scope;
  distributed locking would only matter for cross-instance coordination of the *same* lead, which one atomic claim
  already prevents.
- **Crash recovery:** `IN_PROGRESS` rows older than **10 minutes** (by `updatedAt`) are re-claimable — the claim
  query treats stale `IN_PROGRESS` as claimable (`OR (enrichmentStatus = 'IN_PROGRESS' AND updatedAt < now()-10min)`).
  Mirrors D's `resetStaleInProgress` philosophy; threshold configurable later, hardcoded constant now (no magic-value
  rule: named `STALE_IN_PROGRESS_MS`).
- **Missing website:** engine runs social-discovery-only path (same semantics as execution enrichment:
  `hadSocialOpportunity` branch). If neither website nor social possible (no domain + social port disabled) → `SKIPPED`.
- **Failure:** engine errors → `ENRICHMENT_FAILED` + snapshot with `errors[]` (stored, not exposed verbatim);
  endpoint still returns 200 with failed status (enrichment failure is a result, not an HTTP error) — matches
  execution-enrich semantics.
- **Two simultaneous lead+execution enrichments (Q10):** independent rows; worst case duplicate outbound fetches.
  Accepted (documented); no shared mutable state.

### 6.4 Error model [PROPOSED]

401 `UNAUTHORIZED` · 403 (guard/roles) · 404 `RESOURCE_NOT_FOUND` (unknown/foreign/deleted lead) ·
409 `CONFLICT` (active `IN_PROGRESS`) · 400 `VALIDATION_ERROR` (body/UUID). No new error codes required
(adding codes is allowed but unnecessary — `CONFLICT` exists).

---

## 7. E4 — Frontend Activation

Constraint: **no new framework/library**; extend existing plain-CSS + `requestJson` patterns. All copy Arabic,
matching existing voice.

### 7.1 New API clients [PROPOSED — REQUIRED]

`api/executions.ts`: `runDiscovery(query)` (POST `/search/runs`), `fetchExecution(id)`, `fetchExecutionResults(id)`,
`enrichExecution(id)` (+ shared types: `QualifiedResultDto`, `EnrichmentView`, `ExecutionSummary`).
`api/search.ts`: history type gains `executionId`. `api/leads.ts`: `SavedLead.enrichment`, `enrichLead(id, opts)`,
save payload gains optional `searchResultId`.

### 7.2 SearchView — migrate to the real pipeline [PROPOSED — REQUIRED]

- Submit → `runDiscovery` (replaces `searchBusinesses` as the primary flow; legacy endpoint stays available in code
  but is no longer the default; filter dropdowns remain and are appended to the natural-language query as today).
- Result cards gain qualification badge (`QUALIFIED` / `UNVERIFIED_SOCIAL` / `REJECTED`, Arabic labels) and
  enrichment status chip (6 states).
- "إثراء النتائج" button appears once an execution is loaded; on click → loading state (existing skeleton pattern)
  → `enrichExecution` → `fetchExecutionResults` refresh → badges update (requalification visible via recomputed
  qualification — the F-4 payoff).
- One request, no polling (Q11 — smoke evidence §2.8). Partial failures surface via summary counts in a status line.

### 7.3 ResultDrawer — "الحضور الرقمي" section [PROPOSED — REQUIRED]

Shown when `enrichment` present: website block (title, description, tech-hint chips, social-links list),
social profiles list (platform icon, handle, external link, verified ✓ / unverified badge, confidence %),
enriched-at timestamp. Empty state: "لم يتم الإثراء بعد" + trigger. Failed state: honest failure message + retry.
**Rendering rules [REQUIRED]:** text-only rendering (React escaping — `dangerouslySetInnerHTML` forbidden);
external links `target="_blank" rel="noopener noreferrer"` and rendered only for `http(s)` schemes (client-side
guard; server already curates — defense in depth, F-10).

### 7.4 Saved Leads & Kanban [PROPOSED]

`LeadCard`: single enrichment badge (enriched ✓ / partial / failed / none) — no payload in the card.
Drawer (opened from either view) carries full details + "إعادة الإثراء" action with per-lead loading state.
Kanban: badge only, explicitly **no** additional UI (clutter constraint). [REQUIRED: badge + drawer details + action]

### 7.5 History [PROPOSED — REQUIRED]

Each entry gains "عرض النتائج" (opens execution results view = SearchView seeded from
`fetchExecutionResults(executionId)`, read-only re-enrich allowed). Depends on §4.6 `executionId`.

### 7.6 Explicit non-goals

No polling/SSE, no dark mode, no DnD, no i18n system, no new routes beyond reusing `/dashboard` views.

---

## 8. E5 — Test Plan

### 8.1 Backend (node:test, colocated, stubbed ports) [REQUIRED]

**E1 read path** — `get-execution-results.usecase.spec.ts` / `get-execution.usecase.spec.ts`:
owner ✅; non-owner → `FORBIDDEN` (F-5 regression test); unknown UUID → 404; empty execution → honest empty;
soft-deleted results excluded; snapshot→DTO projection (curated fields only, `errors[]` absent, URL scheme filter);
qualification recomputation matrix (no snapshot → discovery-level; snapshot + `social=PRESENT` criteria →
QUALIFIED/UNVERIFIED_SOCIAL/REJECTED per `requalifyWithEnrichment` table); ordering by `ordering`.
Controller specs: 401 path, envelope shape, UUID validation.
Enrich ownership fix spec: non-owner enrich → `FORBIDDEN` (the F-5 closure).

**E2 persistence** — save-lead: copies all three fields when `searchResultId` resolves enriched; `PENDING` source →
defaults; `IN_PROGRESS` source → not-enriched; missing/foreign `searchResultId` → 404 (and mismatched
`providerRecordId` → 400); idempotent re-save does **not** clobber existing enrichment when no `searchResultId`
posted; restore path resets enrichment only with fresh source. List/get include enrichment block; null-snapshot
mapping. Reader adapter: ownership join enforced (fixture-driven).

**E3** — claim transition atomicity (stubbed repo asserting conditional-update semantics): second concurrent claim →
`CONFLICT`; stale `IN_PROGRESS` (>10 min) re-claimable; no-website → social-only; nothing-to-do → `SKIPPED`;
engine failure → `ENRICHMENT_FAILED` + 200; happy path snapshot persisted + projection returned; not-owner → 404;
deleted lead → 404. Engine extraction regression: all 20 existing `enrich-search-results.usecase.spec.ts` tests
green **unmodified**.

### 8.2 Frontend [OPTIONAL — see Open Question OQ-3]

If a runner is approved (vitest): Drawer enrichment section render (enriched / empty / failed), badge rendering,
loading state on trigger. Otherwise: manual test checklist shipped with E6.

### 8.3 Regression gates [REQUIRED]

`npm test` (382 existing + new) green · `npm run lint` clean · `npm run format:check` clean · `npm run build` green ·
`cd frontend && npm run build` green. No existing test edited except where a spec explicitly covers changed
behavior (enrich ownership fix — new cases added, none removed).

---

## 9. E6 — Production Plan [PROPOSED]

Sequence (each gated, STOP-and-report on any anomaly):

1. **E5 final audit** — full gates (§8.3) + security self-review (§12) + review vs AGENTS.md/docs rules.
2. **Explicit migration approval** — present final SQL (from §5.1, generated via `prisma migrate dev` locally against
   a scratch DB; never `db push`) → wait for user approval.
3. **Production migration** — `npx prisma migrate deploy` (Supabase, via `DATABASE_URL`); verify.
4. **Verify migration status** — `npx prisma migrate status` → 0 pending.
5. **Env vars** — **none required** (enrichment config defaults already active; no new env). No changes.
6. **Production Vercel deploy** — `npx vercel --prod --yes` on the **existing single project**
   (`prj_A6NKoN0mTiKwdTg3tflEpjAVr80B`). No new projects, no preview infra.
7. **Authenticated smoke test** — QA login → `POST /search/runs` → `POST /executions/:id/enrich` →
   `GET /executions/:id` → `GET /executions/:id/results` (verify requalification + curated enrichment) →
   `POST /leads` (with `searchResultId`) → `GET /leads/:id` (verify snapshot copied) → `POST /leads/:id/enrich`
   (verify refresh) → UI walk-through (search → enrich → drawer → save → kanban badge → history → reopen).
8. **Isolation spot-check** — second QA account attempts step-7 reads/enrich on the first account's execution/lead → 403/404.
9. **Final audit report** — same format as Phase D (deployment facts, safety confirmations, no secrets printed).
10. **Doc sync** — update `ROADMAP_CURRENT.md`/`CURRENT_PHASE.md` (F-12) in the same approved commit cycle.

Production rules honored: one Vercel project; no preview/staging; no destructive DB commands; no `db push`;
no secrets printed; no unrelated env changes; commits/pushes/deploy only with explicit approval.

---

## 10. API Contracts (summary)

| Endpoint | Method | Auth | Success | Errors |
|---|---|---|---|---|
| `/api/v1/search/executions/:executionId` | GET [NEW] | Bearer | `{ data: ExecutionDetailDto }` | 400/401/403/404 |
| `/api/v1/search/executions/:executionId/results` | GET [NEW] | Bearer | `{ data: ExecutionResultItemDto[], meta: {count} }` | 400/401/403/404 |
| `/api/v1/search/executions/:executionId/enrich` | POST [EXISTING + ownership fix] | Bearer | unchanged | + 403 for non-owner |
| `/api/v1/search/history` | GET [MODIFIED: +executionId] | Bearer | additive field | unchanged |
| `/api/v1/leads` | POST [MODIFIED: +optional searchResultId] | Bearer | + enrichment block | + 400 mismatch, 404 bad result ref |
| `/api/v1/leads` · `/:id` | GET [MODIFIED] | Bearer | + enrichment block | unchanged |
| `/api/v1/leads/:leadId/enrich` | POST [NEW] | Bearer | `{ data: { leadId, enrichment, durationMs } }` | 400/401/404/409 |

No breaking changes: every modification is additive (`forbidNonWhitelisted` unaffected for existing clients;
`searchResultId` optional; `enrichment` nullable).

## 11. Data Model Changes

Exactly one migration (§5.1). No new tables, no new enums, no FKs, no unique constraints, no destructive
operations. Rollback story in §18.

## 12. Security / Tenant Isolation

- **F-5 closure [REQUIRED]:** execution-level ownership enforced via `job.userId` on all three execution
  endpoints (2 new + 1 fixed). 404-for-unknown, 403-for-foreign — both tested.
- **Client-asserted data:** the only new client-asserted input is `searchResultId` (UUID, server-verified owner +
  providerRecordId match). Snapshot content is never client-writable.
- **Untrusted content (F-9/F-10):** curated read-side projections strip `errors[].message`; all exposed URLs
  scheme-checked at serialization (`https?` only); frontend renders text-only + client-side scheme guard on links;
  `profileUrl` is template-rebuilt upstream (verified `http-social-discovery.provider.ts:225-244`).
- **PII posture unchanged:** same fields already stored on `SearchResult`; copying within the same DB raises no new
  exposure; JWT/RBAC/throttler/helmet/CORS untouched.
- **New-endpoint isolation risk (Q16):** both new GETs are single-tenant by construction (owner filter in the same
  query that fetches); verified by the isolation spot-check in E6 step 8.

## 13. Concurrency / Idempotency

- Execution enrich: unchanged semantics (reset-stale + status filter); locks remain honestly absent (F-6) and are
  documented as such — no pretending.
- Lead enrich: single-row atomic claim (§6.3) gives real mutual exclusion without distributed locking; stale-window
  recovery 10 min.
- Re-running execution enrich after completion: no-op for enriched rows (status filter) — idempotent, unchanged.
- Save-lead: existing idempotency preserved; enrichment copy only on explicit `searchResultId`.

## 14. Error Model

No new error codes. Reused: `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`,
`ENRICHMENT_TARGET_NOT_READY` (unchanged semantics on execution enrich). Enrichment *outcome* failures are 200 +
status fields (consistent with Phase D).

## 15. Performance Considerations

- New GETs: ≤ ~20 rows + one job join; covered by existing indexes (+2 new lead indexes). No N+1 (single
  `findMany` + single execution/job read).
- Qualification recomputation: pure functions over ≤ 20 rows — negligible.
- E3: one website fetch + one social discovery + ≤ N verifications — comfortably inside the 30s function ceiling
  (single-lead, not 20×batch; smoke evidence §2.8).
- Snapshot copy adds one indexed read on save (by PK) — negligible.
- No polling loops introduced; client refetch is event-driven (button → response → refetch).

## 16. Untrusted Data Handling

Sources: provider payloads (Google Places — API-structured), website HTML (title/description/techHints/socialLinks),
social pages (platform/handle — template-normalized). Controls: SSRF/robots/SafeFetcher at fetch time (Phase D,
reused by E3 unchanged — Q15 answer: sufficient); storage as inert JSONB; read-side curated projection + URL scheme
filter; render-side text-only + `rel="noopener noreferrer"` + scheme guard. Stored snapshots are **data, never
instructions** — positions the AI phase for the quarantined-channel rule in `07-ai-insights.md` §7.

## 17. Migration Plan

1. `prisma/schema.prisma` edit (Lead fields + indexes) — E2 code phase.
2. Local scratch DB: `npx prisma migrate dev --name add_lead_enrichment` → review generated SQL vs §5.1.
3. Migration committed (immutable once merged, per DATABASE_RULES).
4. E6 step 3: `npx prisma migrate deploy` in production **only after explicit approval**.
5. Post-deploy verification: `migrate status` 0 pending; `GET /health` up; smoke §9.7.

## 18. Rollback Strategy

- **Code rollback:** redeploy previous commit (`a0db7c3` lineage) — additive columns are ignored by old code
  (unknown JSONB column + defaulted enum = harmless).
- **DB rollback:** **not required** for safety (additive, backfilled `PENDING`, no constraints on existing data).
  If ever demanded: a later `DROP COLUMN` cleanup migration (user-approved, separate); never edit an applied migration.
- **Frontend rollback:** previous build artifact redeploy; API changes are additive so old UI keeps working.

## 19. Explicit Out-of-Scope Items

AI/Gemini anything (next phase) · opportunity scoring / recommended services (Phase F) · Company/Branch/Website/
SocialProfile canonical population · CRM integration / CRM UI · automation, workflows, n8n · enrichment scheduling /
cron / auto-enrich-after-discovery · bulk enrichment · webhooks / polling / SSE · polling UI · headless browser ·
email/phone/review/financial/competitor enrichment · ratings & reviews display beyond existing provider fields ·
frontend test-runner installation (unless OQ-3 approved) · frontend framework/library/i18n/dark-mode/DnD ·
pagination (bounded data) · distributed locking infrastructure · new env vars · new Vercel projects / preview /
staging · any destructive DB command.

## 20. Decision Log

| ID | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| D-01 | Execution ownership via `job.userId` on new + existing endpoints | `createdById` provably always NULL (F-5); job is the true owner anchor | Trusting `createdById`; leaving hole open |
| D-02 | Qualification recomputed at read time via existing pure functions | No schema/write-path change; makes D5 live; cannot diverge from inputs | Persisted qualification column (migration + D-behavior change) |
| D-03 | Lead owns copied snapshot (3 columns, shared enum) | Lead is snapshot-by-design; execution rows are ephemeral evidence | FK/reference to SearchResult; client-posted snapshot (tamperable) |
| D-04 | `EnrichedSearchResultReader` port in leads, Prisma impl reads joined tables | Respects module boundaries (no deep imports); ownership in query | Leads importing search module internals; search module owning lead save |
| D-05 | Extract shared `EnrichmentEngine`; both use-cases delegate | True logic reuse without duplication (Q7); behavior-preserving, D-tests as regression gate | Copy-paste into lead use-case; parameterizing the execution use-case |
| D-06 | New `EnrichLeadUseCase` in leads module | Different aggregate/ownership/persistence; SearchModule exports engine only | One mega-use-case across modules |
| D-07 | Atomic conditional claim (`updateMany`) + 10-min stale window; no distributed lock | Single-row scope makes DB atomicity sufficient; honest about F-6 | Redis/DB advisory locks (infrastructure for no gain); pretending no-op locks work |
| D-08 | Curated enrichment DTO; `errors[]` not exposed; URL scheme filter | Info-leak + XSS defense in depth (F-9/F-10); stable contract vs raw JSONB | Raw snapshot passthrough |
| D-09 | One-request UX; no polling | Sync endpoints already; 30s ceiling documented; simplicity (Q11) | Polling/SSE/webhooks (out of scope) |
| D-10 | Enrichment stays explicit (no auto-enrich) | Cost control, timeout ceiling, roadmap defers scheduling (Q12) | Auto-enrich post-discovery |
| D-11 | Frontend search flow migrates to `/search/runs` | Only path with qualification + executionId; legacy endpoint kept for compatibility (F-3) | Building enrichment UI on legacy `/search` (impossible — no execution) |
| D-12 | `errors[]`-free projection shared conceptually across modules (each maps own DTO) | Trivial mapping; avoids cross-module DTO import for near-zero duplication | Shared DTO package across modules |

## 21. Open Questions

| ID | Question | Default if unanswered |
|---|---|---|
| OQ-1 | Ship the enrich-endpoint ownership fix (F-5) inside E1, or as an immediate hotfix before E starts? | Inside E1 (hole is only reachable by authenticated users; no data-exfil read path exists yet) |
| OQ-2 | Should `GET …/results` include `REJECTED` rows by default? | Yes (full transparency + `?qualification=` filter [OPTIONAL] if desired later) |
| OQ-3 | Approve installing `vitest` for first frontend tests (package addition needs explicit approval)? | No — ship manual checklist instead |
| OQ-4 | Stale `IN_PROGRESS` lead-enrich window = 10 minutes acceptable? | Yes (constant `STALE_IN_PROGRESS_MS`) |
| OQ-5 | UI copy purely Arabic for new labels/badges (matching existing)? | Yes |

## 22. Final Go/No-Go Assessment

**GO.** No architectural blockers. Conditions attached:
1. F-5 ownership fix is REQUIRED content of E1 (security).
2. E4 depends on E1 endpoints + §4.6 history field; E3 depends on D-05 engine extraction passing the unmodified-D-tests gate.
3. Migration deploys only inside E6 with explicit approval (§17).
4. OQ-1/OQ-3 answered (or defaults accepted) before E1/E5 start.

## 23. Recommended Implementation Order

E1 (read path + F-5 fix + history field) → E2 (schema + save copy + lead read changes) → E3 (engine extraction →
lead enrich) → E4 (frontend: executions client → SearchView migration → Drawer → leads/kanban → history) →
E5 (full gates) → E6 (production sequence §9). Each phase lands green (tests+lint+build) before the next;
commits only with explicit approval per phase.

## 24. Appendix — File Impact Map

**Backend — NEW [REQUIRED]**
```
backend/src/modules/search/application/use-cases/get-execution.usecase.ts                (+spec)
backend/src/modules/search/application/use-cases/get-execution-results.usecase.ts        (+spec)
backend/src/modules/search/application/services/enrichment-engine.ts                     (+spec, extraction)
backend/src/modules/search/presentation/controllers/execution-results.controller.ts      (+spec)
backend/src/modules/search/presentation/dto/execution-result.dto.ts
backend/src/modules/leads/application/use-cases/enrich-lead.usecase.ts                   (+spec)
backend/src/modules/leads/domain/ports/enriched-search-result-reader.ts
backend/src/modules/leads/infrastructure/repositories/prisma-enriched-search-result-reader.ts
backend/src/modules/leads/presentation/dto/lead-enrich.dto.ts
prisma/migrations/<ts>_add_lead_enrichment/migration.sql
```

**Backend — MODIFIED [REQUIRED]**
```
prisma/schema.prisma                                        (Lead +3 fields, +2 indexes)
backend/src/modules/search/domain/ports/enrichment.repository.ts   (+findExecutionDetail, +findFullResultsByExecutionId)
backend/src/modules/search/infrastructure/persistence/prisma-enrichment.repository.ts
backend/src/modules/search/application/use-cases/enrich-search-results.usecase.ts  (ownership fix + engine delegation)
backend/src/modules/search/domain/ports/search-job.repository.ts    (history item +executionId)
backend/src/modules/search/infrastructure/persistence/prisma-search-job.repository.ts
backend/src/modules/search/presentation/dto/search-history.dto.ts   (+executionId)
backend/src/modules/search/search.module.ts                (register + export engine/use-cases/controller)
backend/src/modules/leads/domain/entities/lead.entity.ts   (SaveLeadInput+searchResultId, LeadSnapshot+enrichment)
backend/src/modules/leads/domain/ports/lead.repository.ts  (+claim/update enrichment methods)
backend/src/modules/leads/infrastructure/repositories/prisma-lead.repository.ts
backend/src/modules/leads/application/use-cases/save-lead.usecase.ts (+reader injection)
backend/src/modules/leads/presentation/dto/save-lead.dto.ts (+searchResultId)
backend/src/modules/leads/presentation/dto/lead-response.dto.ts (+enrichment)
backend/src/modules/leads/presentation/controllers/leads.controller.ts (+enrich route, save mapping)
backend/src/modules/leads/leads.module.ts                  (reader provider, SearchModule import)
```

**Frontend — NEW/MODIFIED [REQUIRED]**
```
frontend/src/api/executions.ts                             (NEW)
frontend/src/api/search.ts  · api/leads.ts                 (types + fns)
frontend/src/components/SearchView.tsx                     (runs flow, badges, enrich trigger)
frontend/src/components/ResultDrawer.tsx                   (الحضور الرقمي + re-enrich)
frontend/src/components/LeadCard.tsx  · SavedLeadsView.tsx · LeadsPipelineView.tsx (badges)
frontend/src/components/RecentSearchesView.tsx             (open execution results)
frontend/src/components/Workspace.tsx                      (execution state plumbing)
frontend/src/index.css                                      (styles, existing conventions)
```

**Docs [REQUIRED in E6]** `docs/ROADMAP_CURRENT.md` · `docs/handoff/CURRENT_PHASE.md` (F-12 sync) · this spec's status line.

**Explicitly untouched:** Phase D adapters (`http-website-enrichment`, `http-social-discovery`, `http-social-verification`
providers), SSRF/robots/safe-fetcher utils, auth module, `POST /search` legacy endpoint, all 12 scaffold modules,
Vercel config, env files.

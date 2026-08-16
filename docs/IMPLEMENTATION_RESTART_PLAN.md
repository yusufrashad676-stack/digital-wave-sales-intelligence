# Implementation Restart Plan — Local-First Sales Intelligence MVP

Status: Draft v1.0 (analysis-only; no code, schema, migration, package, or deploy
changes were made to produce this document).

Purpose: turn the audited repository into a **working end-to-end Search vertical
slice**, then iterate. Optimize for shipping the product, not documentation
completeness. Use the existing architecture where it is useful; avoid speculative
architecture, queues, brokers, and modules the first slice does not need.

---

## 1. Current Repository Reality

The repository is a NestJS + Prisma 7 + PostgreSQL **backend-only scaffold** with a
strong, documented architecture. Almost everything product-facing is **design
reference, not implementation**.

| Area | Reality |
|---|---|
| Backend runtime | Working. `app.bootstrap.ts` (global prefix `api/v1`, Helmet, CORS, ValidationPipe whitelist + forbidNonWhitelisted, AllExceptionsFilter, TransformInterceptor `{data}`/`{data,meta}`, AccessLogInterceptor, Swagger at `/docs`), `main.ts`, `serverless.ts` (Vercel default export). |
| Auth | Only implemented business module — **legacy self-managed JWT/password** (`auth` module: register/login/refresh/logout/me, Argon2id, refresh rotation, RBAC guards). **Remains the only authentication mechanism (local JWT).** |
| Health | `health` module works (`SELECT 1`, `@Public()`). |
| Database | `prisma/schema.prisma`: 35 models (User, Workspace, Role, Permission, RoleAssignment, Company, Branch, Person, Address, Website, SocialProfile, ContactMethod, Tag, Category, Employment, joins, RefreshToken). 3 migrations, **immutable once merged**. Seed = 3 system roles (ADMIN/MEMBER/GUEST). Soft delete + partial unique indexes per DATABASE_RULES. |
| Pipeline tables | **None exist.** No SearchJob, SearchExecution, ImportSource, RawImport, DuplicateCandidate, VerificationRecord, DataQualityRecord, Opportunity, AIInsight, CRM sync. Designed only in `docs/database/shared/03–11`. |
| Search business logic | **Not implemented.** Only docs (`docs/sales-intelligence/01–10`). `backend/src/modules/search/` is an empty scaffold. |
| Other modules | 13 empty 0-byte `*.module.ts` scaffolds (`activity, ai, automation, branch, category, company, contact, search, social-profile, tag, task, user, website`). `data-quality`, `lead`, `pipeline`, `crm-integration`, `employment` do not exist. |
| Frontend | **Does not exist.** CORS dev defaults already allow `http://localhost:5173` (Vite), which is the intended local SPA origin. |
| Tooling | Prisma 7.9.1 (`@prisma/client`, `@prisma/adapter-pg`), NestJS 11, Express 5, TS 6.0.3, argon2, helmet, pg. Node 24 / npm 11. Tests = `node:test` + `tsx` (colocated `*.spec.ts`, **no Jest** despite MASTER_ARCHITECTURE §14 saying Jest — doc drift). 13 spec files / 65 tests, no DB needed. |
| CI / deploy | **No CI** (no `.github`), no commit hooks, no README. `.vercel/project.json` exists; **never deployed** (source untracked, `dist/` gitignored). No production database provisioned. |
| Docs | Strong reference set: MASTER_ARCHITECTURE (incl. **Architecture Freeze §16**: no schema changes before written review), DATABASE_RULES, API_GUIDELINES, ERROR_HANDLING, SECURITY, NAMING_CONVENTIONS, CODING_STANDARDS, GLOSSARY, ADR-005…010, PHASE_1_AUTH_REPORT. **Docs are the intended design, not the implemented state.** |

Key doc-vs-code conflict to remember: the search docs describe a heavy
**streaming / event-driven / job-serialized** model (`02-search-pipeline.md §3`,
`08-search-api.md §4`). That is the end-state design; the first slice ships a
synchronous path with a persistent result trail. We keep the docs' data shapes
(Import Source, Raw Import, canonical entities) but **not** the full async
machinery in slice 1.

---

## 2. Reusable Foundation

Use as-is, do not re-architect:

- `backend/src/app.bootstrap.ts`, `main.ts`, `serverless.ts` — boot, envelope, validation, guards, filters, interceptors, Swagger, Vercel entrypoint.
- `backend/src/common/**` — TransformInterceptor, AllExceptionsFilter, ErrorCode, `@Public`/`@Roles`/`@CurrentUser`, `AuthPrincipal`, RequestContextService/Middleware, AccessLogInterceptor, validation-errors util.
- `backend/src/database/**` — `PrismaService` (PrismaPg driver adapter, `DIRECT_DATABASE_URL`), generated client wiring.
- `prisma/schema.prisma` + 3 existing migrations + `prisma/seed.ts` + `prisma.config.ts` — **migrations must remain untouched**; new work is additive migrations only.
- RBAC concepts — `User`, `Role`, `Permission`, `RoleAssignment`, `RolesGuard`, seeded roles. **Keep.** Reuse to gate the search API with the existing role model.
- The layer discipline + test pattern from `auth` (ports in `domain/`, use-cases in `application/`, adapters/repos in `infrastructure/`, controllers/guards in `presentation/`; colocated `node:test` specs with stubbed ports). This is the template for the new `search` module.
- Existing 65 tests — must keep passing; they validate the foundation.
- Canonical core entities — `Company`, `Branch`, `Person`, `Address`, `Website`, `ContactMethod`, `SocialProfile`, `Category`, `Tag`, `Employment` + joins, plus `importSourceRef` columns on canonical entities. These are the **targets** basic matching links results to.
- `docs/sales-intelligence/*` and `docs/database/shared/*` — the entity shapes and pipeline vocabulary to implement incrementally.
- Conventions — API_GUIDELINES (envelope, `/api/v1`, kebab-case, cursor pagination), DATABASE_RULES (UUID PK, soft delete, snake_case `@map`, partial unique indexes), ERROR_HANDLING, SECURITY, NAMING_CONVENTIONS, `.js`-suffixed relative imports, `npm run build/test/lint/format:check`.

---

## 3. Authentication Direction

**Clerk was evaluated and rejected for this MVP.** The project is a standalone
local-first Search slice that must stay independent and simple. The existing
self-managed JWT/password auth is the **only** authentication mechanism:

- Keep: `Argon2PasswordHasher`, `JwtTokenAdapter`, `TokenPort`, `PrismaAuthRepository`, the four auth use-cases, `AuthGuard` (JWT verification), `JwtModule`, `/auth/register|login|refresh|logout|me`.
- Keep: `RolesGuard`, `@Roles`, `AuthPrincipal`, RBAC tables.
- The frontend stores the access token locally and sends `Authorization: Bearer <JWT>`.
- No OAuth, no third-party identity provider, no webhook sync, no `clerk_user_id` column.

---

## 4. MVP Boundary

**In scope (slice 1):**

1. User opens the frontend → signs in with the existing local JWT auth (register/login).
2. One search page: search input (Egyptian Arabic, e.g. "عيادات في التجمع") + a small fixed filter set (governorate/area, category, rating, verified-only placeholder).
3. Search button → loading/progressive state.
4. Backend executes a real provider (Google Places first), normalizes results, runs basic matching against existing canonical `Company` rows.
5. Results render progressively; each row shows useful business info (name, category, address/area, phone, website, rating).
6. Company/result detail view (from persisted result + matched canonical data).
7. Persistence trail: Import Source → Search Job → Search Execution → Raw Import → Search Result (read model), so evidence exists for later verification/quality stages.

**Out of scope for MVP** (see §17): CRM UI/sync, workflow canvas, automation canvas, AI chat, dashboard, lead pipeline UI, multi-workspace UI, analytics, admin UI, full verification/DQ/opportunity/AI pipeline, streaming/event infrastructure.

---

## 5. First Vertical Slice

```
Search (frontend input + filters)
  → POST /api/v1/search  (JWT-authenticated)
  → SearchCompaniesUseCase
  → Provider port → Google Places Text Search (+ Place Details for selected rows)
  → RawImport persisted (byte-faithful provider payload, contentHash)
  → Normalization → unified result shape (04-unified-search-model.md §2/§5 fields we need)
  → Basic matching vs existing Company (domain / phone / normalized name)
  → SearchResult persisted (canonical read model, optional companyId link)
  → API response { data: [results], meta: {...} }
  → Frontend renders table/cards; detail view on click
```

Design choices that keep it shippable:

- **Synchronous execution, persistent trail.** One request runs providers + normalization + matching and persists the trail. "Progressive" is achieved by the frontend rendering each normalized result as it is appended from the response (and later, an optional lightweight `GET /search-results?executionId=` polling endpoint if in-flight UX needs it). **No SSE, no job queue, no event bus in slice 1.** The docs' streaming model is post-MVP.
- **Advisory matching only.** Matching never auto-merges and never writes unverified data into canonical `Company` (per `04-unified-search-model.md` §8–9 and `02-search-pipeline.md` §2.4–2.5). It sets `SearchResult.companyId` when a confident match exists; unmatched results stay as results until verification/merge stages land.
- **Lossless normalization.** Anything not mapped to a canonical slot stays in the `RawImport` payload — nothing is dropped (`04 §7`).

---

## 6. Minimal Database Requirements

Per the Architecture Freeze **Rule 1**, a written design proposal for these tables
is the first implementation step; then one additive migration. Existing migrations
are never edited.

New tables (all UUID PK, `createdAt`/`updatedAt`, snake_case `@map`; soft delete
only on user-facing ones; partial unique indexes where uniqueness needs to ignore
soft-deleted rows):

| Model | Purpose | Notes |
|---|---|---|
| `ImportSource` | Registry of data sources (Google Places first) | `code` unique, `name`, `category` (search/maps/directory/...), `enabled`, capability hints (`search`/`lookup`). Seed one row. |
| `SearchJob` | Durable search intent | `userId`/`workspaceId`, `query`, `filters` (JSONB), `status`. Soft-deletable. |
| `SearchExecution` | One run of a job | `jobId`, `importSourceId`, `status`, `providerRequest` (JSONB), timings/counters, optional `error`. |
| `RawImport` | Immutable raw evidence | `executionId`, `importSourceId`, `externalId`, `payload` (JSONB), unique `contentHash` (idempotency), `rawJson` preserved. Append-only — no soft delete. |
| `SearchResult` | Normalized read model | `executionId`, `rawImportId`, canonical fields (name, category, formattedAddress, area, lat/lng, phone, email, websiteDomain, rating, ratingCount, sourceUrl, provider refs), nullable `companyId` FK → existing `Company`. |

Schema touch on existing tables (same migration):

- Seed/registry: add the `ImportSource` row(s); keep the 3 system roles.

Out of this slice: DuplicateCandidate, VerificationRecord, DataQualityRecord,
opportunity, rating-evidence, enrichment-attributes, AI-insight, workflow,
automation-job, CRM-sync tables. They wait for their own slices (§12).

---

## 7. Backend Modules Required for Slice 1

Three functional modules; everything else stays out.

1. **`auth` (unchanged, reused)** — existing JWT verification keeps producing `AuthPrincipal { userId, roles, tokenType }`; `RolesGuard`/`@Public`/`@Roles` keep working unchanged.
2. **`search` (new, replaces the empty scaffold)** —
   - `presentation/`: `SearchController` (`POST /search`, JWT-protected, validated DTO), `SearchResultDto`.
   - `application/`: `SearchCompaniesUseCase` — orchestrates provider → persist raw → normalize → match → persist results → respond; port `SearchProviderPort`.
   - `domain/`: `SearchQuery`, `SearchFilters`, `ProviderResultSet`, `NormalizedResult`, `SearchResult` entity; `SearchProviderPort`.
   - `infrastructure/`: `GooglePlacesProvider` adapter (Text Search + Place Details, fetch-based, env `GOOGLE_MAPS_API_KEY`, typed errors, no logging of secrets), `normalize-company-result` helper, `PrismaSearchRepository` (persist execution/raw/result, basic match query), `PrismaImportSourceRepository`.
3. **`health` + `common` + `database` (unchanged reuse).**

Module boundaries honor the docs' layer rule (`presentation → application → domain ← infrastructure`); `domain`/`application` never import `@nestjs/*` or `@prisma/client`.

---

## 8. Frontend Requirements for Slice 1

- **Vite + React SPA** (matches the existing `localhost:5173` CORS default). TypeScript, minimal deps: `react`, `react-dom`, `vite` toolchain. No UI framework required for one page (plain CSS is fine); add one only if it clearly speeds the slice.
- **Auth shell:** a single login/register form calling the backend `/auth/register` + `/auth/login` endpoints; the access token is stored locally and used as `Authorization: Bearer <JWT>` on search.
- **One search page:**
  - Text input (Arabic-first, no locale switching needed for MVP) + fixed filter controls (area/governorate select, category select, min rating) + Search button.
  - Loading state; render each result as it arrives from the search response.
  - Results as cards/table: name, category, area/address, phone, website (link), rating + count.
  - Row click → detail view (modal or route): full normalized fields + provider source link + matched canonical company link (when present) + "provenance" hint (source, retrieved at).
- **API wiring:** `fetch('/api/v1/search', { Authorization: `Bearer ${token}` })` with the locally stored JWT. Dev proxy `/api` → `http://localhost:3000` (or CORS allowlist — already configured).

---

## 9. Provider Strategy

- **Slice 1 = one provider: Google Places** — Text Search for discovery (`search` capability), Place Details for a selected row (`lookup` capability). This single provider proves the port contract end-to-end.
- **Port over SDK:** `SearchProviderPort.search(query, filters, budget) → ProviderResultSet { results, rawEvidence, provenance }` per `01-provider-architecture.md` §3. The Google adapter is a fetch wrapper; the API key comes from `GOOGLE_MAPS_API_KEY` and is **never logged or stored in imports** (SECURITY.md).
- **Provider Registry is deferred** — slice 1 has exactly one adapter. The port makes adding a registry/fallback later additive, per the docs' isolation/extensibility goals, without building the registry now.
- **Cost/quota control:** small page size, timeout budget, results persisted to `RawImport` so re-runs/UI refreshes don't re-bill the provider unnecessarily. Provider errors surface as typed errors, not generic 500s.
- Later slices add fallback providers (web search, directories) through the same port.

---

## 10. Authentication (JWT-only, no Clerk)

The MVP ships with the existing self-managed JWT/password auth — the only auth
mechanism. There is no migration away from it and no third-party identity provider:

1. Backend keeps `AuthGuard` (JWT `verifyAccessToken`) → `AuthPrincipal`; `RolesGuard`/`@Public` unchanged.
2. Frontend provides a simple login/register screen against `/auth/register` + `/auth/login`, stores the access token locally, and sends it as a Bearer token.
3. No `User.clerkUserId` column, no webhook sync, no `CLERK_*` env vars, no Clerk packages.

---

## 11. Supabase Strategy

- **Supabase = managed PostgreSQL only.** Provision a project, point `DATABASE_URL` (prisma/migrations, `prisma+postgres://` in Prisma 7) and `DIRECT_DATABASE_URL` (runtime, `postgres://`) at it.
- Migrations run via `npx prisma migrate deploy` against Supabase (and `migrate dev` locally). **Never `db push`.**
- **Do not adopt** Supabase Auth, RLS, Edge Functions, or Realtime for the MVP — the backend JWT auth owns identity, Prisma owns the schema, the NestJS API is the only query path (matches the codebase's `config/`-only env reads and `domain`/`application` purity).
- Local dev continues against the local Prisma Postgres (`localhost:51217/51218` per `.env.example`); Supabase is the production deployment target.

---

## 12. Exact Implementation Phases

Each phase ends green: `npm test`, `npm run lint`, `npm run format:check`, `npm run build` all pass.

1. **Phase 0 — Approvals & schema proposal.** Written design proposal for the slice-1 tables (§6) per Freeze Rule 1; freeze-lift/approval recorded. *(This document is the prerequisite; no code yet.)*
2. **Phase 1 — Schema + registry.** Add the 5 pipeline models; one additive migration; seed `ImportSource` (Google Places) + keep roles. Regenerate client.
3. **Phase 2 — Search backend core (dev-accessible).** `SearchProviderPort`, `GooglePlacesProvider`, normalization, basic matching, `PrismaSearchRepository`, `SearchCompaniesUseCase`, `SearchController` (temporarily `@Public()` in dev so the slice is testable without auth). Unit tests for normalization/matching/use-case with stubbed provider.
4. **Phase 3 — Frontend auth (JWT).** Login/register screen against the existing `/auth` endpoints; store the access token locally; search API sends it as a Bearer token.
5. **Phase 4 — Frontend search slice.** Vite SPA: one search page, filters, progressive results, detail view; proxy/CORS wiring.
6. **Phase 5 — Vertical-slice hardening.** End-to-end smoke test locally; provision Supabase PG; `migrate deploy`; **first real Vercel deploy** (compiled `dist/backend/src/serverless.js`); add CI gate (lint/format/typecheck/test) so the frozen standards become enforceable.
7. **Phase 6+ — Post-MVP increments** (each a separate vertical slice, gated the same way): verification → data quality → duplicate candidates/merge → enrichment → opportunity + recommended service → AI insights → CRM integration.

---

## 13. Dependency Order

```
Approvals (Freeze Rule 1)
   └─ Schema + migration (pipeline tables, seeds)
        ├─ Search backend core (port/adapter/normalize/match/repo/use-case) ──┐
        │              │                                                       │
        │              └─ Frontend JWT auth (login/register + Bearer token)    │
        └─ (neither depends on the other; both can proceed in parallel)        │
                                                                               ▼
Frontend: JWT auth shell ──► one search page ──► results + detail ──► E2E smoke
                                                                               ▼
Production: Supabase PG + Vercel deploy + CI gate  ──►  Post-MVP slices
```

Backend search does not depend on auth (kept dev-public during early slices);
auth (JWT) does not depend on search. The frontend needs both.

---

## 14. Testing Strategy

- Keep `node:test` + `tsx` colocated specs (the repo's actual runner — note the docs say Jest; we follow the repo).
- Existing 65 tests must stay green at every phase.
- New slice-1 tests (no DB, stubbed ports — same pattern as `auth`):
  - Normalization: Egyptian-Arabic query + provider payload → canonical result (Arabic text, phone → E.164, domain derivation, address split, rating snapshot).
  - Basic matching: name/domain/phone matching rules, confidence, no-mutation guarantee.
  - `SearchCompaniesUseCase`: happy path, provider failure → typed error, partial results preserved.
  - Provider adapter: request building, response mapping, auth-failure typing (mocked fetch).
  - Guard: JWT token → `AuthPrincipal`, `@Public` bypass, role gating.
- Phase 5 adds one end-to-end smoke (local API + real provider with a tiny budget) and a deploy sanity check (`/api/v1/health` + a search call against production).

---

## 15. Local Development Strategy

- Keep the current local Prisma Postgres setup (`DATABASE_URL` prisma entrypoint vs `DIRECT_DATABASE_URL` pg driver). No containers required.
- `.env` additions: `GOOGLE_MAPS_API_KEY`. Add to `.env.example` (no secrets).
- Frontend: `vite` dev server on `5173`; proxy `/api` → `localhost:3000` (or rely on the existing CORS allowlist).
- Commands stay: `npm run build` (prisma generate + tsc), `npm start`, `npm test`, `npm run lint`, `npm run format:check`. Seed via `npx prisma db seed`.
- Optional `concurrently`-style script to run API + Vite together; not a requirement.

---

## 16. CRM Integration Strategy

- **Not in MVP.** Boundary per `02-search-pipeline.md` §2.11: only **verified, quality-scored opportunities** are ever exported; the internal record is the source of truth; sync is idempotent and records sync state; export failures retry with alerting.
- Slices must be proven in this order first: search → verification → data quality → opportunity. Only after a proven vertical slice of *verified intelligence* will a CRM export endpoint be designed (choose CRM + field mapping then; deferred open question #6 in MASTER_ARCHITECTURE §17).
- No CRM code, tables, or SDKs are introduced before that.

---

## 17. What Must NOT Be Built Yet

Explicitly deferred (anti-scope for slice 1):

- CRM UI and CRM synchronization.
- Workflow canvas and automation canvas / jobs.
- AI chat / conversational interface.
- Dashboard, analytics, admin UI.
- Lead pipeline UI, multi-workspace UI (schema is multi-ready; runtime is single-workspace).
- Streaming/SSE/event-bus/outbox/broker/queue infrastructure (`02 §3`, `08 §4` machinery).
- Provider Registry, fallback/routing/health subsystems beyond the single Google adapter.
- Verification, Data Quality scoring, Duplicate Candidate/merge, Enrichment engine, Opportunity scoring, recommended service, AI insights — as modules/code. (The persisted `SearchResult`/`RawImport` trail is deliberately shaped so these layers slot in later.)
- Rewriting or deleting existing migrations; `db push`; greenfield restructure of the repo; adopting Supabase Auth/RLS/edge functions.

---

## 18. Risks

| Risk | Mitigation |
|---|---|
| Architecture Freeze Rule 1 (schema review before changes) blocks Phase 1 | Phase 0 is the written proposal + approval; budget it as a real milestone, not paperwork. |
| No production DB + Vercel never deployed | Provision Supabase PG and run the first real deploy in Phase 5, before any post-MVP work. |
| Google Places quota/cost + volatile results | Small budgets, result persistence in `RawImport`, typed provider errors, tiny page sizes. |
| Arabic/RTL normalization quality (Egyptian names, governorates) | Normalization is the most-tested unit; canonical values chosen by rules (not AI); raw evidence always preserved. |
| Auth env required at boot (`JWT_*` validation) | JWT is the permanent auth mechanism; keep the env rules and secrets in place. |
| Docs-vs-code drift (Jest vs node:test; streaming-first vs sync slice) | Follow the repo's actual conventions; record drift decisions in this plan. |
| Matching writes unverified data into canonical universe | Advisory matching only; `companyId` link is a reference, never an auto-merge; canonical writes gated to merge/verification slices. |
| Scoping creep into the "full pipeline" | Slice discipline: only §7's three modules exist in slice 1; everything in §17 is refused until its own slice. |

---

## 19. Definition of Done — First Working Search MVP

The MVP is done when all of the following hold, end to end:

1. A user signs in with the **local JWT auth** on the frontend and reaches a single search page.
2. The user enters an Egyptian-Arabic query (e.g. **"عيادات في التجمع"**) with the fixed filters and clicks **Search**.
3. The backend runs a **real Google Places search**, persists the **RawImport** (immutable evidence), normalizes results, runs **basic matching** against existing canonical companies, and persists **SearchResults** (with a nullable canonical `companyId` link).
4. Results render **progressively** in the frontend; each row shows name, category, area/address, phone, website, and rating.
5. Clicking a row opens the **detail view** with full normalized info, provider source link, matched-canonical-company link (when present), and provenance (source + retrieved-at).
6. The pipeline trail is queryable: Import Source → Search Job → Search Execution → Raw Import → Search Result.
7. All 65 pre-existing tests pass plus the new slice-1 tests; `npm run lint`, `npm run format:check`, `npm run build` are green; CI gate added.
8. Deployed: **Supabase PostgreSQL** is the production DB (`migrate deploy` applied), and the app is live on **Vercel** via `dist/backend/src/serverless.js`; `/api/v1/health` returns healthy and a live search call succeeds.
9. The JWT/password auth remains the only authentication mechanism; no Clerk code, env vars, or schema exist in the repo.

---

*AUDIT COMPLETE*

*FILES CHANGED: 0*

*FILES CREATED:*
*- docs/IMPLEMENTATION_RESTART_PLAN.md*

*NEXT STEP: Await explicit approval before implementation.*

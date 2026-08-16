# IMPLEMENTATION_STATUS.md — Feature-by-feature status

Verified 2026-08-16 (read-only audit + `npm test` = 184 pass, 0 fail). Statuses: **DONE** / **PARTIAL** / **NOT STARTED** / **PLANNED** (roadmap) / **ABANDONED** / **REFERENCE ONLY** (docs/frozen schema, no code).

## Backend — implemented

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| NestJS app bootstrap (`createApp`, prefix `api/v1`, global pipes/filters/interceptors/guards) | DONE | `app.bootstrap.ts`, `app.module.ts` | |
| Config module + wholesale env validation | DONE | `config/env.validation.ts` (+spec) | Config via `ConfigService` only |
| Global error handling + `{ error }` envelope + Prisma error mapping | DONE | `common/filters/all-exceptions.filter.ts` (+spec) | P2002/2003→409, P2025→404; `RESOURCE_NOT_FOUND` |
| `{ data }` success envelope + access log + request context | DONE | `common/interceptors/*`, `common/middleware/*` (+specs) | |
| JWT self-managed auth: register / login / refresh / logout / me | DONE | `modules/auth/**` | Argon2id, rotation, reuse detection, RBAC |
| Roles guard + `@Public()` + `@CurrentUser()` | DONE | `auth/presentation/guards/*` (+specs) | GUEST on register |
| Rate limiting (global + auth) | DONE | `app.bootstrap.ts` | `THROTTLE_*`, `AUTH_THROTTLE_*` |
| Health endpoint with DB check | DONE | `modules/health/**` | `/api/v1/health` |
| Search provider port + factory (mock / google-places) | DONE | `search/infrastructure/providers/*` (+specs) | Env-driven selection |
| Search normalization (text/phone/website/rating/verification) | DONE | `search/infrastructure/normalization/*` (+spec) | |
| Search orchestration use-case (job+execution, atomic rawImport+results) | DONE | `search/application/use-cases/search-companies.usecase.ts` (+spec) | Provider call OUTSIDE tx |
| Search persistence repositories (Job/Execution/ImportSource/Result) | DONE | `search/infrastructure/persistence/*` | Prisma-backed |
| Search history | DONE | `get-search-history.usecase.ts` (+spec), controller | limit 1–100 |
| Mock provider (Arabic-aware, honest empty state) | DONE | `mock-search.provider.ts` (+spec) | Active in deployed env |
| Google Places provider adapter (API New, Text Search) | DONE | `google-places.provider.ts` (+spec) | Unit-tested; not activated in deployed env |
| Leads: save (idempotent) / list / get / update / remove (soft delete) | DONE | `modules/leads/**` (+specs ×6) | Owner-scoped, notes ≤4000 |
| Lead snapshot from search result | DONE | `save-lead.usecase.ts`, `LeadCard`/`ResultDrawer` | providerRecordId backstop |
| Soft-delete-aware uniqueness (partial unique index) | DONE | migration `20260815021200_add_leads_active_unique_index`, DATABASE_RULES.md | NOT `@@unique([.., deletedAt])` |
| Swagger at `/docs` | DONE | `app.bootstrap.ts` | |
| Backend tests (node:test + tsx) | DONE | 28 spec files | **184 pass / 0 fail** |

## Frontend — implemented

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Auth UI (login + register) | DONE | `SignInPage.tsx`, `api/{auth,request,session}.ts` | `fetchMe` unwraps `data` (bugfix) |
| Session persistence + single-flight refresh + auto-logout | DONE | `api/request.ts`, `api/session.ts` | localStorage + custom events |
| Search UI (query + filters + chips + states) | DONE | `SearchPanel.tsx`, `SearchView.tsx` | skeleton/error/empty states |
| Result detail drawer (save lead, status, notes, delete) | DONE | `ResultDrawer.tsx` | |
| Saved leads view | DONE | `SavedLeadsView.tsx` | status filter chips |
| Kanban pipeline (5 columns) | DONE | `LeadsPipelineView.tsx` | جديد/تمت المراجعة/تم التواصل/مؤهل/غير مؤهل |
| Recent searches view | DONE | `RecentSearchesView.tsx` | re-run chips |
| Settings view | DONE | `SettingsView.tsx` | account/plan/session/logout |
| Workspace shell + 5 nav sections | DONE | `Workspace.tsx` | الباهر... البحث/عمليات البحث/النتائج المحفوظة/العملاء المحتملين/الإعدادات |
| Path routing (`/`, `/login`, `/dashboard`) | DONE | `App.tsx` | hand-rolled; refresh-safe via vercel fallback |
| Build (tsc -b + vite build) | DONE | `frontend/package.json` | oxlint passes |
| Frontend automated tests | NOT STARTED | — | smoke harness only, outside repo |

## Deployment / data

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Vercel serverless backend | DONE | `serverless.ts`, `vercel.json` | points at compiled `dist/backend/src/serverless.js` |
| SPA catch-all | DONE | `vercel.json` | `/dashboard` refresh 200 |
| Latest preview (dashboard + auth fix) | DONE | `71v31rsi7` | public (SSO disabled) |
| Production current | DONE (stale) | alias → `9d5fuo7j3` | pre-MVP build; intentionally not updated |
| Supabase Postgres + Prisma 7 driver adapter | DONE | `prisma.service.ts` | runtime uses `DIRECT_DATABASE_URL` |
| Migrations (8) applied | DONE | `prisma/migrations/` | local DB applied |
| Seed | DONE | `prisma/seed.ts` | via `prisma db seed` |

## Roadmap / not implemented

| Feature | Status | Phase | Notes |
|---|---|---|---|
| Real Google lead discovery active | NOT STARTED | C | adapter exists; key not configured in deployed env |
| Website + digital presence audit/enrichment | NOT STARTED | D | design refs `sales-intelligence/05-enrichment-engine.md` |
| AI business understanding (Gemini) | NOT STARTED | E | preferred provider Gemini; see `AI_PRODUCT_SPEC.md` |
| Opportunity detection + recommended service | NOT STARTED | F | design refs `06-opportunity-engine.md` |
| Lead qualification/scoring | NOT STARTED | F | |
| Real lead validation | NOT STARTED | G | |
| CRM integration + sync | NOT STARTED | H | see `CRM_BOUNDARY.md` |
| Automation/workflows (n8n or in-house) | NOT STARTED | I | n8n explicitly out of scope now |
| Advanced autonomous sales intelligence | NOT STARTED | J | |
| Frontend tests | NOT STARTED | — | add with C or D |
| Workspace nav URL-addressable | NOT STARTED | — | minor UX |

## Reference only / abandoned

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Full CRM entity models (Company/Branch/Person/Address/Website/SocialProfile/ContactMethod/Tag/Category) | REFERENCE ONLY | `schema.prisma`, `docs/database/**` | frozen; no code reads/writes |
| Workflow / automation-job / duplicate-candidate / verification / data-quality tables | REFERENCE ONLY | `docs/database/shared/**` | design only |
| Enrichment / verification / data-quality / opportunity / matching modules | NOT STARTED | — | no directories even |
| ai / automation / activity / task / user / company / branch / category / contact / website / social-profile / tag modules | NOT STARTED | 0-byte scaffolds | not in AppModule |
| Clerk | ABANDONED | migration `20260809233811` added then `20260811225212` removed; deleted files | never reintroduce |
| `db push` | ABANDONED | DATABASE_RULES.md | migrations only |
| Dashboard / analytics / admin UI | PLANNED | restart plan | deferred |
| Streaming / event transport | PLANNED | design docs | deferred; current search synchronous |

## Cross-cutting

| Item | Status | Evidence |
|---|---|---|
| Lint | PASS | `npm run lint` (eslint backend/src) |
| Format | PASS | `npm run format:check` |
| Backend build | PASS | `npm run build` (needs `DATABASE_URL`) |
| Git state | **UNCOMMITTED** | ~100 changed/new files on `main`; 6 commits; last `d094b7d` (docs freeze). Commit before further dev (user approval required). |

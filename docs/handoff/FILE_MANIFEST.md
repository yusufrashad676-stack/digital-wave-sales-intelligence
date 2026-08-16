# FILE_MANIFEST.md — Complete file inventory

Snapshot taken 2026-08-16 (read-only audit). Grouped by subsystem. `.env`/`.env.local`/node_modules/dist/generated Prisma client are gitignored — never ship them.

## Root

| Path | Purpose |
|---|---|
| `package.json` | Single root package (no `backend/package.json`). NestJS app + Prisma + tooling. Scripts: `build`, `start`, `test`, `test:watch`, `lint`, `format`, `prisma:*`. Node engine `^20.19 \|\| ^22.12 \|\| >=24.0`. `type: module`. |
| `package-lock.json` | Root lockfile. |
| `tsconfig.json`, `tsconfig.build.json` | Backend TS config; NodeNext + `rewriteRelativeImportExtensions` → **all relative imports must use `.js` extension**. |
| `eslint.config.mjs` | Flat config; `no-explicit-any` off (docs are stricter), prettier wired as error. |
| `.prettierrc` | singleQuote, semi, trailingComma all, printWidth 120, tabWidth 2, arrowParens always. |
| `.prettierignore` | Ignore list. |
| `.gitignore` | node_modules, `.env*`, generated prisma client, `.agents/`, dist, `.vercel`, etc. |
| `nest-cli.json` | Nest CLI config. |
| `prisma.config.ts` | Prisma 7 config: schema path, migrations dir + seed, datasource `DATABASE_URL` via `env()` + dotenv. |
| `vercel.json` | Deploy config (see PROJECT_HANDOFF §C/J). |
| `.env.example` | Template — TWO DB vars (`DATABASE_URL` CLI vs `DIRECT_DATABASE_URL` runtime), JWT secrets ≥32 chars, CORS, throttles, search provider vars. |
| `AGENTS.md` | Agent guide — the other source of conventions. NOTE: test count (65) is stale → 184. |
| `dist/` | Compiled output (`dist/backend/src/main.js`, `dist/backend/src/serverless.js`). Gitignored. |
| `docs/` | See docs section. |
| `backend/`, `frontend/`, `prisma/` | See sections below. |
| `node_modules/` | Dependencies. Gitignored. |
| `.agents/`, `.claude/`, `.windsurf/` | Agent tooling config. Gitignored. |
| `.vercel/` | Vercel local link metadata. Gitignored. |

## Backend (`backend/src`) — NestJS hexagonal

**Bootstrap / app wiring**
- `app.bootstrap.ts` — shared `createApp()`: global prefix `api/v1`, Helmet, CORS, throttlers, ValidationPipe (whitelist + forbidNonWhitelisted), TransformInterceptor, AllExceptionsFilter, access-log interceptor, request-context middleware, Swagger `/docs`.
- `app.module.ts` — imports config + `AuthModule`, `SearchModule`, `LeadsModule`, `HealthModule`. (12 scaffold modules NOT imported.)
- `main.ts` — long-running server (`app.listen(port)`).
- `serverless.ts` — Vercel handler, no `listen()`, default-exports Express instance.

**Config**
- `config/configuration.ts`, `config/config.module.ts`, `config/env.validation.ts` (+ `env.validation.spec.ts`) — wholesale env validation; config read only via `ConfigService`.

**Common**
- `common/constants/auth.constants.ts`, `common/context/request-context.service.ts`, `common/middleware/request-context.middleware.ts`, `common/interfaces/{api-envelope,auth-principal,error-response}.interface.ts`.
- `common/decorators/{current-user,public,roles}.decorator.ts`.
- `common/exceptions/`: `app-exception.ts`, `business-rule.exception.ts`, `conflict.exception.ts`, `error-codes.ts` (UPPER_SNAKE codes), `forbidden.exception.ts`, `not-found.exception.ts`, `service-unavailable.exception.ts`, `unauthorized.exception.ts`, `validation.exception.ts`.
- `common/filters/all-exceptions.filter.ts` (+ spec) — error envelope + Prisma error mapping (P2002/P2003→409, P2025→404).
- `common/interceptors/{access-log,transform}.interceptor.ts` (+ spec) — `{ data }` envelope.
- `common/utils/validation-errors.util.ts` (+ spec).

**Database**
- `database/prisma/prisma.service.ts` (+ `prisma.module.ts`) — `PrismaClient` wired with `PrismaPg` driver adapter using `DIRECT_DATABASE_URL` (runtime; **required at boot**).
- `database/generated/prisma/**` — **generated** Prisma client (gitignored; regenerate via `npm run build`). Never hand-edit. From `database/prisma/` import `../generated/prisma/client.js`.

**Auth module** (implemented)
- `presentation/controllers/auth.controller.ts`; DTOs `{register,login,refresh,logout,auth-response}.dto.ts`; guards `auth.guard.ts`, `roles.guard.ts` (+ specs).
- `application/use-cases/`: `register-user`, `login`, `refresh-tokens`, `logout`, `get-me` (+ specs); `user-profile.mapper.ts`.
- `domain/entities/`: `user-account`, `token-pair`, `refresh-token-record`; `domain/ports/`: `auth.repository`, `refresh-token.repository`, `token.port`, `password-hasher.port`, `audit.port`; `value-objects/system-role.enum.ts`.
- `infrastructure/adapters/`: `argon2-password-hasher.adapter.ts`, `jwt-token.adapter.ts` (+ specs), `prisma-audit.adapter.ts`; `infrastructure/repositories/`: `prisma-auth.repository.ts`, `prisma-refresh-token.repository.ts`.

**Search module** (implemented)
- `presentation/controllers/search.controller.ts` (+ spec); DTOs `search-request` (+ spec), `search-result`, `search-history`.
- `application/use-cases/`: `search-companies.usecase.ts` (+ spec), `get-search-history.usecase.ts` (+ spec).
- `domain/entities/`: `search-query`, `provider-result`, `normalized-search-result`; `domain/ports/`: `search-provider.port`, `search-persistence.repository`, `search-job.repository`, `search-execution.repository`, `import-source.repository`.
- `infrastructure/providers/`: `mock-search.provider.ts` (+ spec), `google-places.provider.ts` (+ spec), `search-provider.factory.ts` (+ spec).
- `infrastructure/normalization/normalize-provider-result.ts` (+ spec).
- `infrastructure/persistence/`: `prisma-search-job.repository.ts`, `prisma-search-execution.repository.ts`, `prisma-import-source.repository.ts`, `prisma-search-persistence.repository.ts`.

**Leads module** (implemented)
- `presentation/controllers/leads.controller.ts` (+ spec); DTOs `save-lead` (+ spec), `update-lead` (+ spec), `lead-response`.
- `application/use-cases/`: `save-lead`, `list-saved-leads`, `get-saved-lead`, `update-saved-lead`, `remove-saved-lead` (+ specs); `lead-snapshot.fixture.ts`.
- `domain/entities/lead.entity.ts`; `domain/ports/lead.repository.ts`.
- `infrastructure/repositories/prisma-lead.repository.ts`.

**Health module** (implemented)
- `presentation/health.controller.ts`, `application/health.service.ts`, `domain/health.types.ts`.

**Empty scaffolds (0-byte, NOT in AppModule)**: `activity`, `ai`, `automation`, `branch`, `category`, `company`, `contact`, `social-profile`, `tag`, `task`, `user`, `website` — each just `*.module.ts` + `application/domain/infrastructure/presentation/.gitkeep`.

## Frontend (`frontend`) — React 19 + Vite 8 SPA (Arabic RTL)

| Path | Purpose |
|---|---|
| `index.html`, `public/favicon.svg` | SPA shell, `lang="ar" dir="rtl"`. |
| `src/main.tsx`, `src/App.tsx` | Entry; hand-rolled routing `/dashboard`, `/login`, `/`. |
| `src/index.css` | All styles (single file, CSS vars, RTL). |
| `src/api/request.ts` | Fetch wrapper + single-flight refresh + `ApiError`. |
| `src/api/session.ts` | localStorage `dwsi_access_token`/`dwsi_refresh_token` + `dwsi:session-updated`/`dwsi:session-expired` events. |
| `src/api/auth.ts` | register/login/refresh/logout/fetchMe (**unwraps `data`** — bugfix). |
| `src/api/search.ts`, `src/api/leads.ts` | Endpoint wrappers. |
| `src/api/search-options.ts` | Labels/options constants (Arabic). |
| `src/components/Workspace.tsx` | App shell: brand sidebar, 5 nav sections, avatar, logout. |
| `src/components/SignInPage.tsx` | Login + register. |
| `src/components/SearchPanel.tsx`, `SearchView.tsx` | Search UI + states. |
| `src/components/ResultDrawer.tsx`, `LeadCard.tsx` | Result detail + lead card. |
| `src/components/SavedLeadsView.tsx` | Saved leads + status filter. |
| `src/components/LeadsPipelineView.tsx` | 5-column kanban + summary. |
| `src/components/RecentSearchesView.tsx` | Search history + re-run. |
| `src/components/SettingsView.tsx` | Account/plan/session + logout. |
| `src/components/icons.tsx` | Icon components. |
| `vite.config.ts` | React plugin + `/api` proxy → localhost:3000. |
| `package.json` | `dev`/`build`/`preview`/`lint` (oxlint). React 19, Vite 8, TS ~6.0. |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.oxlintrc.json`, `.gitignore`, `README.md` (Vite template — untouched) | Tooling. |

## Prisma (`prisma/`)

- `schema.prisma` — 41 models (see PROJECT_HANDOFF §G), prisma 7 generator (`prisma-client` → `../backend/src/database/generated/prisma`), soft delete + partial unique indexes, camelCase/`@map` snake_case, `@@map` plural snake_case.
- `migrations/` (8, applied, immutable): `20260805204535_init` → `20260805234626_add_soft_delete_partial_indexes` → `20260806051419_add_password_hash_and_refresh_tokens` → `20260809233811_add_clerk_user_id` → `20260810001424_add_search_persistence_models` → `20260811225212_remove_clerk_user_id` → `20260815021126_add_leads` → `20260815021200_add_leads_active_unique_index`. `migration_lock.toml`.
- `seed.ts` — `prisma db seed` (tsx).

## Docs (`docs/`)

- **Handoff (NEW, authoritative)** — `docs/handoff/`: `PROJECT_HANDOFF.md`, `FILE_MANIFEST.md`, `IMPLEMENTATION_STATUS.md`, `ROADMAP_CURRENT.md`, `AI_PRODUCT_SPEC.md`, `CRM_BOUNDARY.md`, `CURRENT_PHASE.md`.
- **Conventions (authoritative)** — `ARCHITECTURE.md`, `CODING_STANDARDS.md`, `DATABASE_RULES.md` (partial-index registry), `ERROR_HANDLING.md`, `API_GUIDELINES.md`, `NAMING_CONVENTIONS.md`, `SECURITY.md`, `GLOSSARY.md`.
- **Phase reports / plans** — `PHASE_1_AUTH_REPORT.md`, `IMPLEMENTATION_RESTART_PLAN.md` (partially stale — see PROJECT_HANDOFF §W), `MASTER_ARCHITECTURE.md`.
- **Sales intelligence design (design refs, frozen)** — `sales-intelligence/01-provider-architecture` … `10-search-validation`, `SALES_INTELLIGENCE_ARCHITECTURE_FREEZE_v1.0.md`.
- **Database design (design refs)** — `database/01-company`…`10-tag`, `DATABASE_REVIEW.md`, `database/shared/01-user`…`14-workspace`.
- **ADRs (design refs)** — `adr/ADR-005`…`ADR-010`.

## Not shipped / excluded

`.env`, `.env.local` (secrets), `node_modules/`, `dist/`, `backend/src/database/generated/prisma/`, `.vercel/`, `.agents/`, `.claude/`, `.windsurf/`, `frontend/node_modules/`, `frontend/dist/`. The handoff zip follows these exclusions.

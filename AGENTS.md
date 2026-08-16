# Digital Wave Sales Intelligence — Agent Guide

NestJS + Prisma 7 + PostgreSQL backend. Single package, `type: module`. No README — the `docs/` folder is the source of conventions (ARCHITECTURE.md, CODING_STANDARDS.md, DATABASE_RULES.md, ERROR_HANDLING.md, API_GUIDELINES.md, NAMING_CONVENTIONS.md, SECURITY.md).

## Commands

- `npm run build` = `prisma generate && tsc -p tsconfig.build.json`. **Requires `DATABASE_URL`** in `.env` (loaded by `prisma.config.ts` via `dotenv/config`); no DB connection needed, only the var. Emits to `dist/backend/src/**`.
- `npm start` / `start:prod` = `node dist/backend/src/main.js` (build first). Boot fails fast if env is invalid.
- `npm test` = Node's built-in test runner via `tsx`, NOT Jest/Jest globals. All `*.spec.ts` are colocated and run with `tsx --test "backend/src/**/*.spec.ts"` (65 tests). Single file: `npx tsx --test backend/src/<path>.spec.ts`. Tests need no DB/env (use-cases inject stubbed ports).
- `npm run lint`, `npm run format:check` (Prettier: singleQuote, semi, trailingComma all, printWidth 120; prettier runs as an ESLint error).
- Prisma: `npx prisma migrate dev` locally, `npx prisma migrate deploy` in prod. **Never `db push`.** `npx prisma db seed`.

## Two entrypoints (both share `createApp()` in `backend/src/app.bootstrap.ts`)

- `backend/src/main.ts` — long-running server, calls `app.listen(port)`.
- `backend/src/serverless.ts` — Vercel handler, **no `listen()`**; lazily creates the app and default-exports the Express instance. `vercel.json` points at the **compiled** `dist/backend/src/serverless.js` (functions + rewrites). Don't point Vercel at a `.ts` entry — decorator metadata is lost. Do not add a third bootstrap path.

## Import & module quirks

- NodeNext + `rewriteRelativeImportExtensions`: **all relative imports use a `.js` extension** in `.ts` source (`from './x.js'`). Missing the extension breaks `tsc` and tests.
- Generated Prisma client lives at `backend/src/database/generated/prisma` (gitignored; regenerate via `npm run build`). From `database/prisma/`, import `../generated/prisma/client.js`. Never hand-edit generated files.
- Node engine `^20.19 || ^22.12 || >=24.0`.

## Env (`.env` gitignored; `.env.example` is the template)

- Two DB vars, don't mix them up: `DATABASE_URL` (`prisma+postgres://` — CLI/migrations/`prisma generate`, build-time only, from `prisma.config.ts`) and `DIRECT_DATABASE_URL` (`postgres://` — runtime, via PrismaPg driver adapter in `PrismaService`; **required at boot**).
- `JWT_SECRET` and `JWT_REFRESH_SECRET` must each be ≥32 chars or the app refuses to boot.
- `CORS_ORIGINS` comma-separated; empty in production = same-origin only. Defaults (dev) = `http://localhost:5173,http://localhost:3000`.
- Env is validated wholesale by `backend/src/config/env.validation.ts` (wired via `ConfigModule.forRoot({ validate })`). Config is read only through `ConfigService`, never `process.env`.

## Architecture (review-enforced — do not violate)

- Per module: `presentation → application → domain ← infrastructure` (ports & adapters). `domain` depends on nothing; `application` depends only on `domain`.
- **`domain/` and `application/` must not import `@nestjs/*` or `@prisma/client`** — that's a broken dependency direction.
- Controllers: parse via validated DTO, call exactly one use-case, return. No business logic, no Prisma, no `try/catch` (global filter handles errors).
- Raw data access only in `infrastructure/repositories/`; repositories return domain entities, never Prisma rows.
- No deep imports across module boundaries — use the module's `exports`/ports.
- Many `backend/src/modules/*` are empty scaffolds (only `*.module.ts`). Only `auth` and `health` are implemented — don't assume others work.

## API contract (from API_GUIDELINES.md)

- Global prefix `api/v1` is set in `app.bootstrap.ts` — controllers must not add `api/v1` to their `@Controller()` path.
- Success envelope `{ "data": ... }`; error envelope `{ "error": { "code", "message", "details? } }` (TransformInterceptor / AllExceptionsFilter).
- Global `ValidationPipe` is whitelist + `forbidNonWhitelisted` — unknown body/query fields are rejected. Never accept `@Body() body: any`.
- Global guards run on every route: ThrottlerGuard, AuthGuard, RolesGuard. Public routes opt out via `@Public()`.

## Database rules (from DATABASE_RULES.md)

- Schema-first: edit `prisma/schema.prisma` only; migrations generated via `migrate dev`. Only 3 migrations exist; immutable once merged.
- UUID PKs, soft delete (`deletedAt`) + `createdAt`/`updatedAt` on all user-facing tables. Read paths filter out soft-deleted rows.
- **Never `@@unique([field, deletedAt])`** — NULL semantics make it a no-op on Postgres. Soft-delete-aware uniqueness uses SQL partial unique indexes (see the registry table in DATABASE_RULES.md).
- Naming: Prisma fields `camelCase` with `@map("snake_case")` for columns, `@@map` plural snake_case tables, `idx_<table>_<cols>` index names.

## Style & naming

- kebab-case file names with artifact suffix: `create-x.usecase.ts`, `x.repository.ts`, `x.module.ts`, `<name>.spec.ts` colocated.
- Classes PascalCase (no `I` prefix on interfaces); `UPPER_SNAKE_CASE` constants; UPPER_SNAKE error codes in `common/exceptions/error-codes.ts` (renaming a code is breaking).
- `docs/` forbids `any` in shipped code and inline magic values (note: ESLint has `no-explicit-any` off — the docs rule is stricter).

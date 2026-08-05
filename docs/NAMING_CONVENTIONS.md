# NAMING_CONVENTIONS.md

## Purpose

This document defines the naming conventions for every kind of artifact in the
codebase. Consistent naming makes code searchable, self-documenting, and
reviewable at a glance.

The file layout used in examples follows the architecture in ARCHITECTURE.md.

## Language & Baseline

- Language: TypeScript.
- Style: enforced by ESLint + Prettier (`camelCase`, `PascalCase`,
  `UPPER_SNAKE_CASE` as described below).
- Abbreviations: avoid them in identifiers (`repository`, not `repo`;
  `authentication`, not `auth` in type names — `auth` is fine as a module name).

## Classes

- **PascalCase**, single word preferred, otherwise `UpperCamelCase`.
- Prefer concrete, behavior-describing names. Avoid the `Service` suffix for
  classes that do not fit the NestJS provider convention (see Services below).

```ts
export class CreateUserUseCase {}
export class PrismaUserRepository {}
export class GetCompanyHandler {}
```

## Interfaces

- **PascalCase**, no `I` prefix (never `IUserRepository`).
- Ports (domain interfaces) get a `Port` marker only when they are pure
  contracts whose name would otherwise be ambiguous with a concrete class;
  prefer naming the contract after the behavior and the implementation after
  its adapter.
- Conventional suffixes:
  - `Repository` for persistence ports.
  - `Port` for external adapters (e.g. `TokenPort`).
  - `Handler` / `Manager` / `Gateway` for I/O gateways.
  - `Options` for constructor option objects.

```ts
export interface UserRepository { ... }          // port
export interface TokenPort { ... }               // port
export interface JwtConfigOptions { ... }        // options object
```

## Enums

- **PascalCase** for the type name, **UPPER_SNAKE_CASE** for members.
- Prefer `const enum`-style or union literal types when the set is small and
  local; use a `enum` when values cross module boundaries.

```ts
export enum UserRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  GUEST = 'GUEST',
}
```

## DTOs

- **PascalCase** with an explicit shape suffix:
  - Input: `<Action><Subject>Dto` or `<Subject>Dto` (`CreateUserDto`,
    `UpdateUserDto`, `LoginDto`).
  - Response: `<Subject>ResponseDto` (`UserResponseDto`,
    `CompanyListResponseDto`).
  - Params: `<Subject>ParamsDto`, `<Subject>QueryDto`.
- HTTP DTOs live in `presentation/`; application DTOs in `application/` with
  the same naming rules.

## Entities

- **PascalCase**, singular (`User`, `Company`, `Branch`).
- Domain entities are plain classes; if the framework requires a different
  model (Prisma), the Prisma model keeps the same singular PascalCase name but
  never crosses into domain code.

## Repositories

- Interface (port): `UserRepository`.
- Implementation: `<Adapter>UserRepository` (`PrismaUserRepository`).
- Methods are verbs: `findById`, `findByEmail`, `save`, `update`, `softDelete`,
  `countBy`, `findByWorkspace`.

## Files

- **kebab-case** file names.
- Suffix the artifact type with a dot (`user.repository.ts`,
  `create-user.usecase.ts`, `user.controller.ts`, `user.module.ts`,
  `create-user.dto.ts`).
- Test files: `<name>.spec.ts` (unit) and `<name>.e2e-spec.ts` (E2E), placed
  next to the tested artifact.

```ts
// ✔ Examples
user.repository.ts        prisma-user.repository.ts
create-user.usecase.ts    user.controller.ts
user.module.ts            user-response.dto.ts
```

## Folders

- **kebab-case**, lowercase, singular for layer roots
  (`presentation/`, `application/`, `domain/`, `infrastructure/`) and plural
  for collections of artifacts (`repositories/`, `controllers/`, `use-cases/`,
  `dto/` or `dtos/` — pick one per repository and keep it).
- Module roots are singular feature names: `user/`, `social-profile/`,
  `website/`.

## Methods

- **camelCase** verbs: `execute()`, `create()`, `findById()`, `handle()`.
- Use-cases expose `execute(...)` or `handle(...)` as their single entry point.
- Boolean-returning methods read as questions: `isValid()`, `exists()`,
  `canBeDeleted()`.

## Variables & Parameters

- **camelCase** nouns: `user`, `companyId`, `createdBy`.
- Booleans: `is*`, `has*`, `can*`, `should*` (`isActive`, `hasPermission`).
- Avoid single-letter names except loop indices (`i`, `j`) and conventional
  generics (`T`, `K`).
- Never shadow outer variables (`user` inside a `users.map((user) => ...)` is
  fine; shadowing an outer `user` that is still in scope is not).

## Constants

- **UPPER_SNAKE_CASE** for module-level constants.
- Inline magic values are forbidden; name them.

```ts
export const ACCESS_TOKEN_TTL_SECONDS = 900;
export const MAX_PAGINATION_LIMIT = 100;
```

## Environment Variables

- **UPPER_SNAKE_CASE**, prefixed with the project/app name where shared with
  other services (`APP_`, `DB_`, `JWT_`, `AI_`).
- Documented in `.env.example`; validated in `config/`; never read from
  `process.env` outside `config/`.

```ts
DATABASE_URL=postgres://...
JWT_ACCESS_SECRET=...
JWT_ACCESS_TTL=900
APP_PORT=3000
```

## Cross-Cutting Rules

- **Consistency wins:** if you see an established pattern in a module, follow
  it; propose a convention change as a separate PR.
- **Singular vs plural:** use the same choice as the domain concept. A `User`
  entity persists in the `user` module and is exposed at `/users` (plural only
  for URL paths, see API_GUIDELINES.md).
- **Prefix consistency:** module-scoped providers may be prefixed with the
  module (`UserService` in `user/`); global/shared providers live in
  `common/` and carry generic names.

## Forbidden

- ❌ `I`-prefixed interfaces (`IUser`).
- ❌ PascalCase file names (`UserRepository.ts`).
- ❌ camelCase or kebab-case class names.
- ❌ Abbreviated names without a stated reason (`usr`, `repo`, `prms`).
- ❌ Magic numbers/strings used inline instead of named constants.
- ❌ `snake_case` or `SCREAMING_CASE` variables.
- ❌ Environment variables without a prefix or without `.env.example` entry.

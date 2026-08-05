# CODING_STANDARDS.md

## Purpose

This document defines the coding rules every backend engineer must follow. It
covers the core principles we hold ourselves to and the specific rules for each
code artifact we produce (services, repositories, DTOs, controllers).

Compliance is expected at review time. Style is enforced by tooling where
possible (ESLint + Prettier) — architecture is enforced by review.

## Core Principles

### SOLID

- **S — Single Responsibility:** each class has one reason to change. A
  controller routes, a use-case orchestrates, a repository persists, a DTO
  shapes data. Never combine two of these jobs in one class.
- **O — Open/Closed:** extend behavior via new classes (new use-cases, new
  adapters) rather than modifying existing ones. Prefer composition over
  inheritance.
- **L — Liskov Substitution:** any implementation of a port must be usable
  wherever the port is expected, without special-casing. Adapters that satisfy
  an interface must fully honor its contract.
- **I — Interface Segregation:** define small, focused ports. A repository
  interface should expose only the operations its consumers actually need.
- **D — Dependency Inversion:** depend on abstractions (domain ports), not
  concretions. Adapters are injected, never constructed by business code.

### DRY — Don't Repeat Yourself

- Extract duplicated logic into `common/` utilities or shared use-cases.
- A rule implemented twice is a bug waiting to diverge.
- Exception: do not extract prematurely when the two call sites have no shared
  contract yet (see YAGNI).

### KISS — Keep It Simple, Stupid

- Prefer the simplest solution that satisfies the requirement.
- A method that needs six branches to explain is a signal to decompose.
- Simple > clever. Readability beats brevity.

### YAGNI — You Ain't Gonna Need It

- Build what the current, approved requirements demand. No speculative
  abstractions, no "we might need this later" generics, no unused ports.
- Empty folders are fine; empty abstractions are not.

## Rules by Artifact

### Controllers (`presentation/controllers/`)

- One controller per resource/route group.
- Controller methods are thin: parse input (via DTO), call one use-case, map
  the result to a response shape.
- **No business logic inside controllers.** No `if` on business state, no
  computations, no decisions about domain outcomes.
- **No Prisma calls inside controllers.** Never.
- No direct repository usage inside controllers.
- No `try/catch` for business outcomes in a controller — global exception
  filters handle errors (see ERROR_HANDLING.md).
- Authorization belongs in guards; keep controller bodies free of auth checks.

```ts
// ✔ Correct
@Get(':id')
findById(@Param('id') id: string): Promise<UserResponseDto> {
  return this.getUserUseCase.execute(id);
}
```

```ts
// ✘ Forbidden
@Get(':id')
async findById(@Param('id') id: string) {
  if (id === 'admin') { return { secret: true }; }          // business logic
  const user = await this.prisma.user.findUnique(...);      // prisma in controller
  const isVip = user.tier === 'VIP' ? ... : ...;            // business logic
  return user;
}
```

### Use-Cases / Application Services (`application/`)

- One use-case class per business operation; name it after the outcome
  (`CreateOrderUseCase`, not `OrderHelper`).
- Use-cases orchestrate: fetch via ports, invoke domain logic, persist via
  ports, return a result.
- Depend only on domain ports and other use-cases through explicit interfaces.
- Use-cases are stateless singletons — any instance state is a bug.
- Throwing domain/business exceptions (see ERROR_HANDLING.md) is preferred over
  returning sentinel values.

### Repositories (`infrastructure/repositories/`)

- Repositories implement domain ports; they are the only classes that touch
  Prisma models.
- A repository returns domain entities (mapped from persistence), never raw
  Prisma rows.
- Repository methods are persistence concerns: `findById`, `findBy`, `save`,
  `update`, `softDelete`, `count` — not business workflows.
- Transactions that span multiple repository calls belong to a use-case (via
  the transaction boundary from `database/`), not inside a repository.
- Repositories must not decide business outcomes; they persist and retrieve.

### DTOs (`presentation/` and `application/`)

- **HTTP DTOs** (`presentation/`): shape of request bodies and response
  payloads; carry `class-validator` decorators for input validation.
- **Application DTOs** (`application/`): inputs/outputs of use-cases; plain
  TypeScript types/classes with no framework validation decorators.
- Never expose Prisma model types as API responses.
- Never accept raw `body: any` in controllers — always a validated DTO.
- One DTO per distinct shape; do not mutate DTOs to serve two APIs.

```ts
// ✔ Correct HTTP DTO
export class CreateUserDto {
  @IsEmail() email: string;
  @MinLength(8) password: string;
}
```

```ts
// ✘ Forbidden
async create(@Body() body: any) { ... }
```

## General Rules

- **Type safety:** no `any` in shipped code. If `any` is genuinely required,
  it must be a typed `unknown` narrowing or an explicitly reviewed exception.
- **Nullability:** be explicit. Use `T | null` for nullable returns, not
  `undefined` overloads or empty strings as sentinels.
- **Immutability:** prefer `readonly` arrays/properties and avoid mutating
  inputs passed in.
- **Async:** all I/O methods are `async`; return typed `Promise<T>`.
- **No comments that restate the code.** Comments explain *why*, not *what*.
- **Naming** follows NAMING_CONVENTIONS.md.
- **Error handling** follows ERROR_HANDLING.md.
- **No dead code:** remove unused imports, params, branches. Lint fails on them.
- **No logging of secrets** — ever (see SECURITY.md).
- **Formatting:** Prettier default config; run `format` before committing.
- **Tests:** new use-cases and repositories require unit tests. A PR that adds
  logic without tests will be rejected.

## Forbidden Practices (summary)

- ❌ `any` leaks in public signatures.
- ❌ Controllers with business logic or Prisma access.
- ❌ Domain/application code importing `@nestjs/*` or `@prisma/client`.
- ❌ Services named `SomethingService` with mixed concerns (see naming).
- ❌ Raw database access outside `infrastructure/repositories/`.
- ❌ Silent `catch {}` blocks.
- ❌ Mutating DTOs across request boundaries.
- ❌ Duplicating a rule that already lives in `common/`.
- ❌ Speculative abstraction built "for the future".

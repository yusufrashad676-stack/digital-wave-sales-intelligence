# ARCHITECTURE.md

## Purpose

This document defines the architectural foundation of the backend. It is the
single source of truth for how code is layered, how dependencies flow, and why
we isolate the domain from frameworks such as NestJS and Prisma.

Any change that violates the dependency rules described here requires explicit
approval from the architecture owner before it is merged.

## Technology Stack

- **Framework:** NestJS (TypeScript)
- **ORM:** Prisma Client
- **Database:** PostgreSQL
- **Authentication:** JWT (stateless, Bearer tokens)
- **Validation:** class-validator + class-transformer (NestJS `ValidationPipe`)

## Repository Layout

```
backend/
└── src/
    ├── common/        # Shared, cross-cutting infrastructure (guards, filters, pipes, decorators, utils)
    ├── config/        # Configuration providers + environment schema validation
    ├── database/      # PrismaModule + PrismaService (single persistence contact point)
    └── modules/
        └── <feature>/
            ├── domain/          # Entities, value objects, ports (interfaces)
            ├── application/     # Use-cases, application services, application DTOs
            ├── infrastructure/  # Adapters implementing domain ports (Prisma repositories, external clients)
            ├── presentation/    # Controllers, guards, HTTP DTOs
            └── <feature>.module.ts  # NestJS module wiring
```

## The Four Layers

### Presentation Layer

**Location:** `modules/<feature>/presentation/`

**Responsibility:** Translating between HTTP and the application layer. This is
the only layer that knows about HTTP semantics: routes, status codes, request
shapes, response shapes, headers, and session/auth primitives.

**Contains:**
- Controllers (route + verb definition only)
- Guards (authentication / authorization for routes)
- HTTP DTOs (request/response validation classes)

**Rules:**
- A controller method must delegate to exactly one application-layer use-case.
- No business logic. No branching on business state. No Prisma calls.
- No repository access. No direct data access of any kind.

### Application Layer

**Location:** `modules/<feature>/application/`

**Responsibility:** Orchestrating use-cases. The application layer implements
the business workflow: it fetches what it needs through ports, applies domain
rules (via the domain layer), and returns results to the presentation layer.

**Contains:**
- Use-case classes (one per business operation)
- Application services (coordination, transactions)
- Application DTOs (input/output shapes of use-cases)

**Rules:**
- Depends only on `domain` (ports, entities). Never on NestJS request/response
  objects or Prisma types.
- Contains no HTTP knowledge: no `@Controller`, no `@Get`, no `HttpException`
  semantics — use domain exceptions (see ERROR_HANDLING.md).
- Orchestrates, does not implement low-level persistence.

### Domain Layer

**Location:** `modules/<feature>/domain/`

**Responsibility:** The innermost layer. Holds the business core: entities,
value objects, and the interfaces (ports) that the rest of the application
programs against.

**Contains:**
- Entities (business objects with identity)
- Value objects (immutable, no identity)
- Ports (repository interfaces, e.g. `UserRepository`)

**Rules:**
- Zero imports from NestJS.
- Zero imports from Prisma (`@prisma/client`).
- No TypeScript decorators that carry framework behavior.
- Must be testable in isolation with no database, no HTTP, no framework.

### Infrastructure Layer

**Location:** `modules/<feature>/infrastructure/`

**Responsibility:** Implementing the ports defined in `domain`. This layer
adapts external concerns — the database, HTTP clients, file storage, AI
providers — to the interfaces the domain defines.

**Contains:**
- Prisma repository implementations (implements `domain` port)
- External service adapters (email, AI, third-party APIs)
- Framework bindings for external concerns only

**Rules:**
- Implements `domain` interfaces; never imported by `domain` or `application`
  (except through dependency injection).
- May depend on Prisma, NestJS, and third-party libraries.
- No business rules live here; only data translation and I/O.

## Dependency Direction

```
    presentation ──► application ──► domain
                                  ▲
    infrastructure ────────────────┘  (implements domain ports)
```

- Dependencies point **inward**, toward `domain`.
- The `domain` layer depends on nothing.
- `application` depends only on `domain`.
- `presentation` depends on `application` (and transitively on `domain` types).
- `infrastructure` depends on `domain` ports (which it implements) and on
  external libraries — never the reverse.
- Cross-module access must go through the exporting module's `module.ts` and
  the official API of that module (use-cases / ports), never through deep
  imports into another module's internals.

> **Rule of thumb:** if `domain` (or `application`) imports anything from
> `@nestjs/*` or `@prisma/client`, the import direction is broken.

## Ports & Adapters

**Port** — an interface in the `domain` layer that describes what the
application needs from the outside world (e.g. `UserRepository`,
`TokenGenerator`, `NotificationSender`).

**Adapter** — an implementation in the `infrastructure` layer that fulfills a
port (e.g. `PrismaUserRepository implements UserRepository`,
`JwtTokenGenerator implements TokenGenerator`).

**Inversion of Control:**

1. The use-case declares the port it needs as a constructor dependency.
2. NestJS resolves the port to its adapter implementation at runtime (via
   `@Injectable()` + the module's `providers`).
3. The domain and application layers never know which concrete adapter is in
   use, so we can swap PostgreSQL for another store, or a real AI client for a
   fake, without touching business code.

**Example**

```ts
// domain/ports/user-repository.port.ts
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
}
```

```ts
// infrastructure/repositories/prisma-user.repository.ts
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? User.fromPersistence(row) : null;
  }
}
```

```ts
// application/use-cases/get-user.usecase.ts
@Injectable()
export class GetUserUseCase {
  constructor(private readonly users: UserRepository) {} // port, not adapter
  async execute(id: string): Promise<User> { ... }
}
```

**Testing:** ports are trivial to fake in unit tests — inject a stub that
implements `UserRepository` and the use-case is fully testable without a
database.

## Why Domain Never Depends on NestJS or Prisma

1. **Testability.** Domain and application logic can be exercised in plain unit
   tests — no NestJS testing module, no database, no HTTP server.
2. **Framework independence.** NestJS is a delivery mechanism, not the domain.
   If the team ever migrates frameworks, the business core moves unchanged.
3. **Persistence independence.** Prisma models are a persistence concern. Coupling
   domain entities to `@prisma/client` types makes every schema migration a
   potential business-breaking change.
4. **Clarity.** When the domain is pure, business rules are easy to read,
   review, and audit. Business intent is not buried inside ORM calls or HTTP
   plumbing.
5. **Parallel work.** Multiple teams can evolve adapters (infrastructure) and
   business rules (domain/application) independently as long as the ports are
   stable.

## Module Boundaries

- Each feature lives under `modules/<feature>/` and is self-contained.
- A module may only expose: its `module.ts`, its use-cases (via the NestJS
  module `exports`), and its ports.
- Modules should not import each other's `infrastructure` or `presentation`
  internals. Shared logic belongs in `common/` or a dedicated module, not in a
  feature module's private layers.
- Circular imports between modules are forbidden.

## What We Never Do

- ❌ `import { PrismaClient } from '@prisma/client'` inside `domain/`.
- ❌ `import { Injectable } from '@nestjs/common'` inside `domain/`.
- ❌ Business logic inside controllers or repositories.
- ❌ Calling Prisma from controllers.
- ❌ A use-case importing another use-case's private infrastructure.
- ❌ Importing deep paths across module boundaries (`../../user/infrastructure/...`).
- ❌ Adding a new layer "because it's convenient" — every layer change goes
  through review.

## Lifecycle & Evolution

1. New features start as a domain port + use-case (behavior first).
2. Adapters are added last, only after the use-case contract is stable.
3. When a dependency rule would be violated to ship a feature, stop and raise
   the architectural concern in review — do not quietly work around the layers.

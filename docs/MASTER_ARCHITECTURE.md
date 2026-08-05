# MASTER_ARCHITECTURE.md

## Digital Wave Sales Intelligence Platform — Master Architecture

**Version:** 1.2
**Status:** DATABASE DESIGN FREEZE v1.0
**Scope:** Single source of truth for the entire platform: vision, layers, data
flow, modules, event model, entity relationships, principles, dependency rules,
scalability, stack, roadmap, and governance.

**Companion documents** (normative references):
- `ARCHITECTURE.md` — Clean Architecture layer rules and ports & adapters
- `GLOSSARY.md` — authoritative business vocabulary
- `DATABASE_RULES.md` — schema, keys, soft delete, indexes, migrations
- `API_GUIDELINES.md` — REST contract
- `ERROR_HANDLING.md` — exceptions, logging, sanitization
- `SECURITY.md` — auth, RBAC, secrets, audit
- `NAMING_CONVENTIONS.md` / `CODING_STANDARDS.md` — code hygiene
- `docs/adr/ADR-005 … ADR-010` — database decision records (authoritative for
  the choices they record)

If this document conflicts with any other document, this document wins; raise
the conflict immediately.

**Version history**
- **1.2 (this version):** DATABASE DESIGN FREEZE v1.0 declared. Database
  decision records ADR-005…ADR-010 accepted; global/workspace scope matrix
  recorded (§10); open questions #1/#2 closed.
- **1.1:** Applied architecture review decisions — future multi-tenant
  readiness, Person as a global entity linked to Companies only via
  Employment, Data Quality promoted to its own module, domain Event Model, and
  the Architecture Freeze.
- **1.0:** Initial approved baseline.

---

## 1. High-Level Product Vision

The Digital Wave Sales Intelligence Platform turns raw, fragmented business data
into a continuously maintained, trustworthy, and actionable view of the
commercial world — organizations, branches, people, and their digital presence.

Unlike a traditional CRM (which records internal relationships and is the
system of action), this platform is a **system of research and intelligence**:

- It **discovers** organizations and people from external sources at scale.
- It **normalizes, deduplicates, and verifies** that data so the platform is
  trusted — bad data is the product's core risk.
- It **analyzes** the data with AI to surface insights and suggestions, never
  editing data directly.
- It **feeds** business workflows, tasks, and leads, and exports qualified
  targets downstream toward the CRM that owns the actual sales relationship.

The platform's promise: *"Right entity, right data, right person, right time —
with proof."*

### North-star principles

1. **Trust over volume.** A verified, complete record beats ten unverified ones.
2. **Provenance always.** Every fact can be traced to its source and checks.
3. **AI advises, humans decide.** AI never mutates data; it proposes.
4. **One clear responsibility per entity.** No overloaded concepts (GLOSSARY.md).
5. **Sales intelligence, not CRM.** We research and qualify; the CRM owns the
   relationship.
6. **Tenant-ready by design.** v1 ships single-tenant, but every aggregate and
   access decision carries the shape a future Workspace/Tenant root boundary
   requires — identity, ownership, and audit fields are tenant-ready from day one.
7. **Person is global.** People are a platform-wide asset. A Person never
   belongs to a Company; the link exists only through Employment.

---

## 2. System Layers

The platform implements the four-layer Clean Architecture defined in
`ARCHITECTURE.md`. Dependencies point inward. The domain is framework-free.

### Presentation Layer

- **Location:** `modules/<feature>/presentation/`
- **Responsibility:** HTTP adaptation — routes, verbs, guards, validation DTOs,
  response shaping. No business logic, no data access.
- **Contains:** controllers, HTTP DTOs, route guards.
- **Also here (cross-cutting):** global pipes, filters, interceptors wired in
  bootstrap; global security middleware (Helmet, CORS, throttling).

### Application Layer

- **Location:** `modules/<feature>/application/`
- **Responsibility:** Orchestrating use-cases. Implements workflows, applies
  domain rules via the domain layer, coordinates transactions.
- **Contains:** use-cases, application services, application DTOs.
- **Rules:** depends only on domain; no HTTP objects, no Prisma types, no
  `@nestjs/*` framework semantics.

### Domain Layer

- **Location:** `modules/<feature>/domain/`
- **Responsibility:** The business core — entities, value objects, ports.
- **Contains:** entities, value objects, repository/port interfaces.
- **Rules:** zero imports from NestJS or Prisma; fully testable in isolation.
- **Events:** domain events are defined here (see §8) and published through
  ports, never emitted directly to a broker.

### Infrastructure Layer

- **Location:** `modules/<feature>/infrastructure/`
- **Responsibility:** Adapting the outside world to the domain ports.
- **Contains:** Prisma repositories, external clients (data providers, AI),
  token/email/verification adapters, `database/` (PrismaModule/PrismaService),
  event bus implementation.
- **Rules:** implements domain ports; may use any library; no business rules.

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation   HTTP · guards · DTOs · global middleware    │
│          │                                                  │
│  Application    use-cases · orchestration · transactions    │
│          │                                                  │
│  Domain         entities · value objects · ports · events   │
│          ▲                                                  │
│  Infrastructure adapters · Prisma repos · external clients  │
│                  · event bus implementation                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

The canonical lifecycle of data in the platform. Every stage is a distinct,
named responsibility; no stage is skipped or merged silently.

```
Search ──► Raw Import ──► Normalization ──► Duplicate Detection
   ──► Verification ──► AI Analysis ──► Business Entities
   ──► Workflow ──► CRM
```

| # | Stage | Owner (module) | Responsibility | Output |
|---|-------|----------------|----------------|--------|
| 1 | **Search** | `search` | Parameterized discovery from external sources and user-defined Search Jobs | Qualified candidate records |
| 2 | **Raw Import** | `search` (import pipeline) | Immutable capture of what the source returned, attributed to an Import Source | Raw Import snapshot |
| 3 | **Normalization** | `search` (ingestion) | Structural cleanup: field casing, address splitting, phone/email canonicalization, standard naming | Normalized records |
| 4 | **Duplicate Detection** | `data-quality` | Pair/group matching against existing entities; produces Duplicate Candidates | Duplicate Candidates |
| 5 | **Verification** | `data-quality` | Automated + manual checks (email deliverability, address, domain, social) — always auditable | Verified facts + Confidence Scores |
| 6 | **AI Analysis** | `ai` | Insights (read-only observations) and Suggestions (proposed changes awaiting approval) | Insights & Suggestion queue |
| 7 | **Business Entities** | core modules | Data lands as trusted Organizations, Branches, Persons, Contact Methods, Websites, Social Profiles, carrying Data Quality scores | Canonical entities |
| 8 | **Workflow** | `automation` | Rules react to entity/lead/domain events: create tasks, activities, leads, outreach | Tasks / Activities / Leads |
| 9 | **CRM** | integration (planned) | Qualified leads exported to external CRM(s) that own the sales relationship | Exported leads / sync status |

**Rules:**
- Stages are horizontal slices, not modules that own data — entity ownership
  stays with core modules (GLOSSARY.md single-responsibility rule).
- Raw Import is immutable; corrections happen downstream, never by editing the
  snapshot.
- Verification output is always auditable (actor, method, timestamp, outcome).
- **Confidence and Data Quality scoring are computed at stages 4–7** by
  `data-quality`; they attach to entities as derived, recomputable values and
  are never hand-edited.
- AI sits strictly between analysis and proposal — it never writes directly to
  Business Entities.
- No stage may bypass Duplicate Detection or Verification when creating
  entities.

---

## 4. Core Modules

The canonical business entities. One module per entity; one clear
responsibility each.

| Module | Entity (GLOSSARY) | Responsibility |
|--------|-------------------|----------------|
| `user` | User | Platform actors; authentication-relevant identity, profile, settings |
| `company` | Organization | The primary research target; root of the data hierarchy |
| `branch` | Branch | Organizational units (many per Organization) |
| `website` | Website | Independent digital-presence entity (domain-level) |
| `contact` | Person / Contact Method | Human subjects and their owned channels — **Contact Method is NOT a person** |
| `social-profile` | Social Profile | Independent third-party network presences |
| `category` | Category | Controlled, curated taxonomy |
| `tag` | Tag | Free-form user-defined labels |

**Person is a global entity.** People are platform-wide assets, never children
of a Company. The only link between a Person and an Organization (or Branch) is
the **Employment** relationship:

```
Person ──(Employment)──► Company ──► Branch
```

- Employment carries role/title, tenure (start/end), and current/historical
  status, and is itself verified and audited.
- `contact` owns Person, Contact Method, and Employment. If volume demands, the
  Employment join may split into its own `employment` module — the relationship
  shape does not change.

**Cross-cutting:** `auth` (authentication/RBAC primitives) spans all core
modules but owns no business data.

---

## 5. Intelligence Modules

The differentiators: discovery, trust, and analysis.

| Module | Responsibilities |
|--------|------------------|
| `search` | Search Jobs (definition + executions); Raw Import capture; normalization; import-source provenance. Produces candidates — never silently overwrites existing entities |
| `data-quality` | Verification; Duplicate Detection (Duplicate Candidates); Confidence Scoring; Data Quality Scoring (own module, see below) |
| `ai` | AI Insights (read-only analysis); AI Suggestions (proposed actions with approval lifecycle) |

### Data Quality Module (`data-quality`)

An architecture module in its own right. Four named responsibilities, each with
one clear contract:

| Component | Responsibility | Output |
|-----------|----------------|--------|
| **Verification** | Automated + manual checks that a fact is true (email deliverability, address, domain, social, employment) | Auditable Verification records (actor, method, timestamp, outcome) |
| **Duplicate Detection** | Pair/group matching of Organizations and Persons against existing entities | Duplicate Candidates awaiting confirmation |
| **Confidence Scoring** | Per-fact confidence in a specific value (e.g. how likely this email belongs to this person) | `confidence` on Contact Methods, Addresses, links |
| **Data Quality Scoring** | Composite record/dataset measure (completeness, accuracy, freshness, source reliability) | `quality` score/status on entities |

**Rules:**
- `search` produces candidates; `data-quality` judges them; core modules own the
  canonical write. `data-quality` never writes canonical entities directly.
- Confidence Scoring feeds Data Quality Scoring; Data Quality Scoring never
  edits the underlying facts.
- Verification records are immutable and always auditable.
- All scores are derived and recomputable — never hand-edited fields.

**Planned:** `enrichment` — data-gap filling jobs (technologies, financials,
hiring).

**Rules (module-wide):**
- `ai` reads; approved Suggestions execute as audited actions via `automation`.
- No module may bypass Duplicate Detection or Verification when creating
  entities.

---

## 6. CRM Modules

The engagement and qualification layer — the bridge from intelligence to
outreach. This is deliberately thin: the platform qualifies and prepares; the
downstream CRM owns the relationship.

| Module | Responsibilities |
|--------|------------------|
| `task` | Planned work owed to a User (subject, due date, state) |
| `activity` | Append-only record of interactions/events |

**Planned (per GLOSSARY.md):**
- `lead` — the qualified target wrapper (Organization/Person + score + source +
  owner), with stage transitions audited.
- `pipeline` — stage configuration that governs lead progression (configuration,
  not per-lead data).
- `crm-integration` — export/sync of qualified leads to external CRM(s).

---

## 7. Automation Modules

Rule-driven execution of business process.

| Module | Responsibilities |
|--------|------------------|
| `automation` | Workflow definitions (trigger → conditions → actions) and Automation Job executions; audit of every side effect |

**Rules:**
- Workflows are declarative configuration; executions are observable,
  idempotent, retryable Automation Jobs.
- Workflows react to **domain events** (§8) and lead/entity state changes.
- All side effects (tasks, activities, leads, exports) are traced in the
  Audit Log.
- Versioned — changing a rule never rewrites history.

---

## 8. Event Model (future)

The platform will support **domain events** as the integration backbone between
modules and toward external systems. This section defines the contract now so
modules publish cleanly from day one, even though delivery starts with an
in-process bus.

**Definition:** A domain event is an immutable, versioned record of a fact that
happened in the past, published by the owning module when an aggregate changes
state.

**Canonical event names (examples):**
- `CompanyCreated` — a new Organization entered the platform.
- `WebsiteAdded` — a Website was attached to an Organization/Branch.
- `ContactVerified` — a Contact Method/Address passed (or failed) verification.
- `AIInsightGenerated` — an AI Insight was produced for an entity.
- `WorkflowExecuted` — an Automation Job completed with its side effects.
- Additional candidates: `DuplicateCandidateResolved`, `PersonEmployed`,
  `LeadStageChanged`, `ImportCompleted`.

**Event contract:**
| Aspect | Rule |
|--------|------|
| Naming | `PastTenseFact`, e.g. `ContactVerified` (see NAMING_CONVENTIONS.md) |
| Content | `eventId`, `eventType`, `occurredAt`, `version`, `aggregateId`, `payload`, optional `causationId` (parent action) |
| Immutability | Events are never edited once published; corrections are new events |
| Versioning | Event schemas are versioned; consumers tolerate older versions |
| Ownership | Each event is published by the module that owns the aggregate |
| Delivery | In-process domain-event bus first; message broker (outbox pattern) when scaling demands (§13) |
| Traceability | Every event links to `requestId` and, when applicable, `userId`/`Automation Job` |

**Rules:**
- Domain events are defined in the `domain` layer and published through ports;
  the infrastructure layer implements the bus. Business code never talks to a
  broker directly.
- Consumers (e.g. Workflows, Audit Log, `data-quality`, `crm-integration`)
  subscribe through their own ports — they never import the producer module.
- Events are the mechanism by which Workflows and integrations observe the
  platform without coupling modules.

---

## 9. Infrastructure Modules

Non-feature scaffolding shared by all modules.

| Area | Location | Responsibility |
|------|----------|----------------|
| Shared cross-cutting | `common/` | decorators, base DTOs, exceptions, filters, guards, interceptors, interfaces, pipes, utils |
| Configuration | `config/` | Env schema validation; the only reader of `process.env` |
| Persistence | `database/` | PrismaModule + PrismaService; single DB contact point |
| Authentication | `auth/` | JWT access/refresh, password hashing, RBAC guards and permissions |
| Event bus | `common` (infrastructure) | In-process domain-event bus; outbox/broker adapter later |

---

## 10. Entity Relationships Overview

High-level relationships per GLOSSARY.md and the applied review decisions.
Arrow = "one-to-many" unless noted. Independence notes per the glossary
invariants.

```
Workspace (future root boundary — v1 is single-tenant)
   │  every aggregate is tenant-ready; ownership/audit fields from day one
   │
   └─► Organization ── 1..n ── Branch ── 1..n ── Address
        │ 1..n                    │ 1..n
        ├── Website*              ├── Website* (optional, branch-level)
        └── Social Profile*       └── Social Profile* (optional)
        (* Website and Social Profile are independent —
           not parent/child of each other)

Person ──(Employment 0..n)──► Organization     (NEVER Person→Company direct)
Person ── 1..n ── Contact Method               (owned; never the reverse)
Person ──(Employment)──► Branch               (via Organization)

Lead    ── wraps ── Organization|Person  (1 Lead → 1 subject; no copies)
Lead    ── moves ── Pipeline            (stages = configuration)
Task    ── assigned to ── User
Activity── scoped to ── Organization|Person|Branch|Lead
Search Job ── produces ── Raw Import ── from ── Import Source
Duplicate Candidate ── between ── 2..n Organizations|Persons
Verification ── applies to ── Contact Method|Address|Website|Social Profile|Employment
Workflow ── executes as ── Automation Job
User ── has ── 1..n Role ── grants ── 1..n Permission
User|Automation Job|System ── records ── Audit Log
```

**Relationship invariants (enforced by domain):**
- Contact Method is NOT a person; a Person owns multiple Contact Methods.
- **Person is a global entity and never belongs directly to a Company.** The
  only link is `Person → Employment → Company → Branch`.
- Branch belongs to exactly one Organization; Organization may have many
  Branches.
- Website is independent from Social Profiles.
- AI never edits data directly.
- Verification is always auditable.
- Workspace/Tenant is the future root boundary; v1 aggregates are shaped for it.
- Every entity has a single clear responsibility.

### 10.1 Global vs Workspace Scope Matrix (ADR-010)

Authoritative classification; every new entity must be classified before schema work.

| Scope | Entities |
|---|---|
| **Global** (single-copy, never cloned) | Company, Person, Address, Website, Social Profile, Category, Tag |
| **Workspace** (owned within one workspace) | Search Job, Search Execution, Workflow, Automation Job, Audit visibility |
| **Mixed** (global identity, scoped authorization) | User, Role, Permission |

Global entities are never duplicated per workspace; workspace observations live
on scoped joins. See ADR-010.

---

## 11. Architecture Principles

1. **Clean Architecture, enforced.** Dependencies point inward; domain never
   imports NestJS or Prisma (see §12 and ARCHITECTURE.md).
2. **Trust as a first-class value.** Ingest, deduplicate, verify, and score —
   never bypass.
3. **Provenance and auditability.** Every fact and every verification is
   traceable; audit log is append-only.
4. **AI as advisor.** Insights inform; Suggestions propose; humans or audited
   jobs apply.
5. **One responsibility per entity.** Overloaded concepts are model errors.
6. **Person is global.** People are platform-wide assets; Company links exist
   only through Employment.
7. **Tenant-ready by design.** Single-tenant in v1, Workspace root boundary in
   the future; every aggregate and audit field is shaped for it now.
8. **Events as the seam.** Modules change state locally and communicate through
   domain events, not by importing each other's internals.
9. **Configuration over code.** Pipelines and workflows are declarative,
   versioned configuration.
10. **Sales intelligence, not CRM.** Research and qualify here; the CRM owns the
    relationship.
11. **Security and privacy by default.** Deny-by-default access; minimal data;
    secrets never in code (SECURITY.md).
12. **Simple before scalable.** Correct, simple, and observable first; scale only
    when measured demand requires (§13).
13. **Documents are normative.** Standards are enforced by review until tooling
    can enforce them.

---

## 12. Dependency Rules

1. **Layer direction:** `presentation → application → domain`, with
   `infrastructure → domain` (implementing ports). Inward only.
2. **No framework leakage:** `domain/` and `application/` never import
   `@nestjs/*` or `@prisma/client`.
3. **Ports & Adapters:** domain defines the port; infrastructure implements it;
   NestJS DI resolves it. Business code never constructs adapters.
4. **Module boundaries:** modules interact through their `module.ts` exports
   (use-cases and ports) only. Deep imports across modules are forbidden.
5. **Cross-cutting access:** `common/`, `config/`, `database/` are imported
   downward by any layer; feature modules never export infrastructure internals.
6. **No circular imports** between modules (tooling-enforced).
7. **Persistence isolation:** only `infrastructure/repositories/` touches Prisma
   models; controllers and use-cases never query the database directly.
8. **Schema→domain mapping:** Prisma models map to domain entities at the
   repository boundary; raw rows never cross into application code.
9. **Error flow:** layers throw typed exceptions; the global filter maps them to
   HTTP (ERROR_HANDLING.md). No layer returns HTTP-shaped errors.
10. **Canonical writes:** `search` and `data-quality` never write canonical
    entities directly; they go through the owning core module's ports.
11. **Events outward:** modules publish domain events through their ports and
    consume others' events through their own subscriptions — never by importing
    the producer.
12. **Rule of thumb:** if a dependency would require importing a deeper layer or
    a framework into a core layer, stop and raise it in review.

---

## 13. Future Scalability Guidelines

**Modularity / monolith-first**
- Keep the platform as a well-structured modular monolith. Extract modules into
  services (event-driven) only when profiling shows a real bottleneck — never
  prematurely.
- Module boundaries (§12) are the extraction seams: each module already exposes
  only ports and use-cases.

**Data volume**
- Postgres is expected to carry the canonical dataset. Plan for: partitioned
  tables for Raw Imports and Audit Log (time-based), index strategy per
  DATABASE_RULES.md, and archive/retention jobs.
- Raw Imports and audit events are write-heavy and immutable — ideal candidates
  for object storage / log sink offloading when volumes warrant it.

**Read performance**
- Cursor pagination everywhere; cached read models for dashboards where
  verified latency demands; no ad-hoc raw SQL outside repositories.

**Async, jobs, and events**
- Search Jobs, enrichment, and Automation Jobs are asynchronous. Abstract the
  execution mechanism (in-process queue → message broker) behind the automation
  port so it can be swapped without touching use-cases.
- Domain events (§8) start on an in-process bus and graduate to an outbox +
  broker when cross-process delivery is required. Event consumers are
  idempotent by `eventId`.
- Idempotent, retryable, observable job executions (§7).

**Multi-tenancy**
- v1 is single-tenant, but the future root boundary is a **Workspace**.
- Identity, RBAC scoping, ownership, and audit fields are designed tenant-ready:
  every aggregate carries the shape (workspace id, creator, scope) required to
  introduce the boundary without remodeling.
- Stateless service nodes behind a load balancer; JWT stateless auth; shared
  Postgres. Push stateful or hot data (rate limits, refresh-token denylists)
  into Redis only when a measured need appears.

**AI / model evolution**
- Insights and Suggestions are versioned by model; outputs are labeled and
  auditable. Never couple domain logic to a specific provider — port the AI
  client behind an adapter.

**Testing**
- Unit-test the domain/application layers with port fakes; integration-test
  repositories; E2E the pipeline (Search → Import → Verification → Workflow).
- Event-driven behavior is tested through the bus abstraction, not a broker.

---

## 14. Technology Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | TypeScript (strict) | Single language across platform |
| Framework | NestJS | Modular, DI-native, opinionated |
| ORM / DB access | Prisma Client | Schema-first; the only query path |
| Database | PostgreSQL | Source of truth; UUID PKs; soft delete |
| API | REST, JSON | `/api/v1`, see API_GUIDELINES.md |
| Validation | class-validator + class-transformer | Global ValidationPipe (whitelist) |
| Auth | JWT (access + rotated refresh) + bcrypt | See SECURITY.md |
| RBAC | Roles + Permissions, workspace-scoped | Default deny; tenant-ready |
| Security middleware | Helmet, CORS allowlist, throttler | See SECURITY.md |
| Errors | Global exception filter + typed exceptions | See ERROR_HANDLING.md |
| Logging | Structured JSON, requestId correlation | See ERROR_HANDLING.md |
| Scheduling/async | In-process queue initially (port-backed) | Extraction-ready per §13 |
| Events | In-process domain-event bus initially | Outbox/broker path defined per §8 |
| Secrets | Environment injection / secrets manager | `config/` is the only reader |
| Linting/format | ESLint + Prettier | Enforced in CI |
| Testing | Jest (unit/integration), e2e | Required for logic PRs |

*Stack additions beyond this list require architecture review.*

---

## 15. Development Roadmap

All phases are subject to the **Architecture Freeze** (§16): no phase starts a
schema change or ships API endpoints before the corresponding design review.

**Phase 0 — Foundation**
- Bootstrap NestJS app, `config/`, `database/` (Prisma), global pipes/filters,
  Helmet/CORS/throttling, CI, `.env.example`. Tenant-ready config shape from the
  start. *(Pending, see §18 recommendations.)*

**Phase 1 — Core entities**
- `user` + `auth` (register/login, JWT, RBAC skeleton); `company`, `branch`,
  `address`; `website`, `social-profile`; `category`, `tag`. CRUD use-cases with
  repositories; soft delete; audit fields.

**Phase 2 — People & engagement basics**
- `contact` (Person + Contact Methods + **Employment**); `task`; `activity`;
  workspace-ready scoping in all queries.

**Phase 3 — Ingestion & trust**
- `search` Search Jobs → Raw Import → normalization; `data-quality` module:
  Duplicate Detection, Verification, Confidence Scoring, Data Quality Scoring;
  provenance and audit.

**Phase 4 — Intelligence**
- `ai` Insights and Suggestion lifecycle (approval flow, model-versioned,
  audited). Enrichment jobs.

**Phase 5 — Leads & pipeline**
- `lead`, `pipeline` stages, lead scoring, stage transition audit.

**Phase 6 — Automation & events**
- `automation` Workflows + Automation Jobs; in-process domain-event bus (§8);
  side-effect audit.

**Phase 7 — CRM integration**
- `crm-integration` export/sync of qualified leads (event-driven); sync status;
  idempotency.

**Phase 8 — Hardening & scale**
- Load/volume testing, partitioning of high-volume tables, caching where
  measured, observability (metrics/traces), retention/archival jobs, outbox +
  broker if cross-process delivery is required.

Each phase gates on: standards compliance (docs), tests, and a working
vertical slice before the next phase begins.

---

## 16. Architecture Freeze

The architecture is now **frozen** as documented in this file. The database
design baseline is declared **DATABASE DESIGN FREEZE v1.0** — the core entity
designs, the 14 cross-cutting entities in `docs/database/shared/`, and the
decision records ADR-005…ADR-010 are the approved baseline for `schema.prisma`.
Until the freeze is lifted by the architecture owner, the following rules apply
to every change.

**Rule 1 — No Prisma changes before review.**
- No model additions, modifications, or index changes are made to
  `prisma/schema.prisma` before a written design review.
- Any schema change requires a design proposal covering: entity, relationships,
  keys, indexes, soft-delete, and audit fields (per DATABASE_RULES.md), reviewed
  and approved by the architecture owner.
- Migrations generated from an unapproved schema are rejected in review and
  reverted.

**Rule 2 — No API implementation before schema approval.**
- No controller, route, or endpoint implementation ships before the underlying
  schema is approved.
- Prototypes are permitted only against approved DTOs and mocked/port-driven
  data — never against an unapproved schema.
- Every endpoint added must conform to API_GUIDELINES.md at merge time.

**Rule 3 — All architectural changes require documentation updates.**
- Any change to layers, modules, entity relationships, the event model, data
  flow, dependency rules, or principles must update this document — and any
  affected companion document — in the same change.
- Merging code whose architecture diverges from this document without updating
  it is a blocker, not a follow-up.

**Rule 4 — Scope of the freeze.**
- The freeze applies to schema and API surfaces (the parts most expensive to
  change). Non-schema internal work (config, common primitives, standards
  tooling) may proceed, but must remain compatible with the frozen design.
- Lifting the freeze, or any exception to Rules 1–3, requires written approval
  from the architecture owner, recorded in this document's version history.

---

## 17. Open Questions

*To be resolved during design sessions; each answer updates this document and
the companion docs. Items marked RESOLVED were closed by the DATABASE DESIGN
FREEZE v1.0.*

1. ~~**Workspace mechanics:** is the future root boundary a distinct Workspace
   entity, or is an Organization the tenant? Which aggregates carry tenant scope?~~
   **RESOLVED (ADR-010, 14-workspace.md):** Workspace is the ownership boundary;
   scope matrix fixed; v1 is single-workspace, multi-ready.
2. ~~**Employment history:** modeling tenure and effective dating — how are
   current vs. historical roles represented and verified over time?~~
   **RESOLVED (05-employment.md, ADR-009):** Employment links Person→Company via
   Branch; current state derived from `leftAt`; integrity enforced in the
   application layer.
3. **Event delivery:** in-process bus → outbox → broker — at what trigger do we
   introduce the outbox? Are domain events the *sole* Workflow trigger?
4. **Confidence scoring:** which checks and signals feed per-fact Confidence vs.
   record-level Data Quality, and how do the two compose?
5. **Lead vs. Data Quality score:** how lead score and Data Quality score
   interact in lead qualification and ranking. *(Lead/Pipeline design is
   deferred to the CRM phase — out of scope for DATABASE DESIGN FREEZE v1.0.)*
6. **CRM integration scope:** which CRMs, which lead fields, and how sync
   conflicts are resolved downstream. *(Deferred to the CRM phase.)*

---

## 18. Recommendations Before Implementation

1. **Bootstrap the application skeleton** — `package.json`, `tsconfig`, ESLint/
   Prettier, Nest CLI config, `src/main.ts` wiring global prefix, pipes, filters,
   Helmet/CORS/throttler, and `prisma/schema.prisma` with provider + client
   generator only (no models yet, per the freeze and the no-business-logic
   constraint).
2. **Add the module folders the review created** — `data-quality/` (and the
   planned `employment/`, `lead/`, `pipeline/`, `crm-integration/`) as the
   architecture evolves; keep `contact` until the module-renaming question is
   settled (see 5).
3. **Update GLOSSARY.md to promote newly official terms** — Employment,
   Workspace, Confidence Scoring, Data Quality Scoring, Domain Event — from the
   "missing concepts" list into formal definitions so schema work uses approved
   vocabulary.
4. **Run the schema design proposal for Phase 1 entities** (user, auth, company,
   branch, address, website, social-profile, category, tag) as the first artifact
   under the freeze — entity list, relationships, keys, indexes, soft-delete,
   audit fields — and approve it before any Prisma model is written.
5. **Resolve the `contact` module naming tension** — the GLOSSARY forbids the
   word "Contact" as a concept, yet the module is named `contact`. Decide
   between renaming to `person` or documenting the exception before Phase 2.
6. **Stand up the standards tooling** (commit hooks, CI lint/format/typecheck,
   test gate, schema-review checklist) so the freeze rules and documented
   standards are enforceable, not aspirational.
7. **Write ADRs for the open choices** referenced by the docs — cursor vs offset
   pagination, bcrypt vs argon2id, in-process queue vs broker + outbox, Postgres
   partitioning plan, and the event delivery trigger.

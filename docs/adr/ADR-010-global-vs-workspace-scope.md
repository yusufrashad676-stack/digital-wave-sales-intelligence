# ADR-010 — Global vs Workspace Scope

## 1. Status

**Accepted** (DATABASE DESIGN FREEZE v1.0)

## 2. Context

The B5 blocker asked: which entities are global (shared, single-copy across workspaces)
and which are workspace-scoped (owned within one workspace)? A Workspace (14) is the
ownership boundary. v1 operates a single workspace but must be multi-workspace-ready
without data migration.

## 3. Problem

Without an explicit matrix, every new entity and join risks a wrong default: cloning
global data per workspace (data duplication, breaking Person-global identity) or leaving
scoped data unguarded (cross-workspace leaks). The matrix must be fixed now even though
v1 is single-workspace.

## 4. Decision

**Scope matrix (authoritative):**

### Global (single-copy, shared across workspaces)
- **Company**
- **Person**
- **Address**
- **Website**
- **Social Profile**
- **Category**
- **Tag**

Global entities are never cloned per workspace. They are referenced from scoped records;
visibility across workspaces is governed by the scoped joins, not by duplication.

### Workspace-scoped (owned within one workspace)
- **Search Job**
- **Search Execution**
- **Workflow**
- **Automation Job**
- **Audit visibility** (audit entries are written once with a workspace scope; review and
  export are filtered by boundary)

These entities carry a workspace reference and are invisible outside their workspace.

### Mixed (identity global, authorization scoped)
- **User** — one global identity; membership in a workspace is a per-workspace fact.
- **Role** — global catalog in v1; workspace-scoped roles are future (12-role.md §10).
- **Permission** — global catalog; enforcement is boundary-aware via scoped grants.

## 5. Alternatives Considered

- **Everything workspace-scoped** — rejected: Person-global is a core invariant; cloning
  global people per workspace destroys the dedupe model and identity.
- **Everything global** — rejected: no ownership boundary; cross-workspace data leaks are
  impossible to control; violates the Workspace purpose.
- **Company scoped** — rejected: companies are researched facts independent of the
  observer, like Person; the same real company is one record, and workspace-specific
  observations live on joins (per the mixed pattern).

## 6. Consequences

- The matrix is recorded in MASTER_ARCHITECTURE.md (§10) and DATABASE_RULES.md as
  normative; new entities must be classified before schema work.
- Global entities must never acquire a workspace key; scoped entities must always carry
  one.
- Audit review and workflow/automation operate within a workspace boundary (ADR-010
  aligns with 14-workspace.md and 11-automation-job.md).
- Multi-workspace enablement is operational (adding workspace rows + memberships), not
  structural.

## 7. Trade-offs

- **Pro:** single-copy global truth (correct dedupe, one canonical Person/Company);
  hard isolation for operational data; no migration path for multi-tenant.
- **Con:** global entities are readable across boundaries in controlled ways — cross-
  workspace read of a global record requires a scoped join to grant visibility; the
  discipline must be maintained per entity.

## 8. Future Revisions

- New entities get a scope classification as part of their design proposal (freeze rule).
- If an entity moves categories (e.g., Company becomes mixed with per-workspace
  observations), it follows the mixed pattern (global identity + scoped joins), never by
  cloning the global row.

---

Related: 14-workspace.md, 01-user.md, 12-role.md, 13-permission.md, 02-audit-log.md,
04-search-job.md, 06-search-execution.md, 10-workflow.md, 11-automation-job.md; blocking
B5 in DATABASE_REVIEW.md.

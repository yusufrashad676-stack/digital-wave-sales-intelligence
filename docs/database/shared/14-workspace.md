# 14 — Workspace

Status: Draft v1.0 (Phase 4.4)
Design doc cross-referenced by: DATABASE_REVIEW.md B5, MASTER_ARCHITECTURE.md §6 (multi-tenant readiness), 01-user.md, 04-search-job.md, 11-automation-job.md

## 1. Purpose

A Workspace is the **ownership boundary** of the platform: the container that scopes who
can see and act on what. In v1 the platform operates a **single Workspace**; the design is
explicitly multi-workspace-ready so that scoping can be enabled without a schema migration.

It exists to answer the B5 question ("global vs tenant-scoped") with a concrete boundary:
some entities are global (Person, dictionaries), while operational entities and joins are
scoped to a Workspace. Workspace carries **ownership and isolation only** — no billing or
subscription concerns are in scope.

## 2. Responsibilities

- Define the ownership boundary for operational data and activities.
- Anchor membership: which Users belong to (and operate within) the workspace.
- Provide the scope reference for Audit Log, Search Jobs, Automation Jobs, and scoped Roles.
- Carry governance state (active/suspended) without any commercial model.
- Leave the global-vs-scoped matrix (B5) enforceable per entity.

## 3. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| code | code | Canonical workspace identifier (e.g., `main`, `acme`). |
| name | text | Human-readable display name. |
| status | state | `active`, `suspended`, `archived` (see Lifecycle). |
| ownerModel | enum | `single` (v1) or `multi` (future); documents the intended deployment mode. |
| defaultSettings | structure | Workspace-level operational defaults (naming, retention, policy references). |
| createdBy / createdAt | audit | Governance actor who created it. |
| updatedAt | timestamp | Last mutation. |
| deletedAt | timestamp | Soft-delete marker. |

## 4. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Workspace → User (membership) | n : m | Via UserWorkspace join; membership is the authorization link into the workspace. |
| Workspace → Role (scoped roles) | 1 : n | Roles defined within this workspace scope (12-role.md §4). |
| Workspace → Scoped operational entities | 1 : n | Search Jobs, Automation Jobs, audit entries, and scoped business joins carry the workspace reference (B5). |
| Workspace → Audit Log | 1 : n | Audit entries carry workspaceScope for boundary-consistent review. |

## 5. Validation Rules

- code is required and unique (canonical form); immutable.
- status transitions follow the Lifecycle; `suspended` stops operational activity.
- A workspace must have at least one owner-member before it can be `active`.
- v1 policy enforces a single `active` workspace (policy-level, not schema-level — the
  schema remains multi-capable).
- Global entities (Person, dictionaries) must **not** be duplicated per workspace; scoping
  applies to joins and operational records, never by cloning global data.
- Membership changes must preserve at least one owner.

## 6. Lifecycle

```
created → active ⇄ suspended → archived
```

- **created**: defined, not yet operational.
- **active**: users operate within it under its scoped roles.
- **suspended**: operational activity stops; data remains intact and queryable to owners.
- **archived**: read-only history; no new activity. Soft-delete only.

## 7. Ownership

The **workspace owner(s)** (Users holding an owner role within the workspace) govern
membership and scoped roles. **Platform governance** owns the workspace record itself
(create/suspend/archive). There is no commercial ownership concept in v1.

## 8. Security Considerations

- A Workspace is a **hard isolation boundary**: cross-workspace data access is denied even
  for shared global entities (read is scoped through joins, not by cloning).
- Membership is required for any workspace-scoped action; absence of membership is denial.
- Global entities are read-visible across workspaces only where the B5 matrix explicitly
  allows it — never by default.
- Suspension is a governance-gated, audited action that halts operational execution.
- Workspace code/name are not secrets; they never hold credentials.

## 9. Audit Requirements

- Workspace lifecycle (create, suspend, archive) is audited with governance actor.
- Membership grants/revocations are audited.
- Scoped-role changes within a workspace are audited (via Role/RoleAssignment audit).
- Audit entries themselves carry workspaceScope so a boundary review is possible.

## 10. Future Scalability

- Multi-workspace rollout needs no schema change: v1 already carries the membership join
  and scope references; enabling `multi` is operational, not structural.
- Global entities stay single-copy (Person, dictionaries); scaling adds workspaces without
  duplicating global data.
- Per-workspace retention and policy defaults (defaultSettings) scale additively.
- Isolation remains enforceable as the workspace count grows — the boundary is a field, not
  an environment.

## 11. AI Interaction

- AI never creates, suspends, or archives workspaces.
- AI operates strictly within the workspace scope of its initiating job; it can never read
  across the boundary (see 11-automation-job.md §10).
- AI suggestions inherit the workspace scope of the event that triggered them.

## 12. Workflow Interaction

- Workflows run **within** a workspace scope, carried on the Automation Job and its Audit
  entries.
- A workflow cannot act across workspace boundaries; its permission grants are
  workspace-scoped when the workflow is scoped.
- Workspace lifecycle events (suspended) are domain events that halt scoped workflows.

## 13. Index Strategy

- `code`: canonical uniqueness and lookup.
- `status`: active/suspended view.
- UserWorkspace by user: membership lookup.
- Workspace-scoped operational indexes carry the workspace reference as a leading
  component where boundary queries dominate.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Workspace, and resolves the RBAC side of B5.
- Implements the B5 principle: global entities are single-copy; scoping applies to joins
  and operational records.
- Consistent with 01-user.md (global identity + per-workspace membership) and
  04-search-job.md / 11-automation-job.md workspaceScope fields.
- Explicitly excludes billing/subscription concerns from the design (ownership only).

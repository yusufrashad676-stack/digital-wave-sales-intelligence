# 13 — Permission

Status: Draft v1.0 (Phase 4.4)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, 12-role.md, 14-workspace.md, 11-automation-job.md (workflow authority)

## 1. Purpose

A Permission is the **atomic, fine-grained capability** the platform can grant. It is the
smallest unit of authority that can be attached to a Role and enforced on an action. Every
gated operation in the platform maps to exactly one permission.

The permission catalog is a governance artifact: stable, versioned, and additive. New
capabilities are added as new permissions; existing permissions are never repurposed.

## 2. Responsibilities

- Name one specific capability unambiguously and at a fine grain.
- Group related capabilities for management, reporting, and review.
- Provide the enforcement vocabulary: what may be attempted against what.
- Scope capability by resource/action (and optionally by owner vs platform scope).
- Serve as the authority source for workflows (workflow grants reference permissions).

## 3. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| code | code | Fine-grained capability code; the naming convention below. |
| name | text | Human-readable capability name. |
| group | lookup | Grouping strategy field (see §6); groups capabilities for management. |
| scope | enum | `platform` (platform-wide capability) or `scoped` (owner/workspace-scoped). |
| description | text | Exact semantics of what is allowed. |
| status | state | `active`, `deprecated` (see Lifecycle). |
| createdBy / createdAt | audit | Governance actor who introduced it. |
| updatedAt | timestamp | Last mutation. |
| deletedAt | timestamp | Soft-delete marker. |

## 4. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Permission → Role | n : m | Via the RolePermission join (12-role.md). |
| Permission → Group | n : 1 | Grouping via lookup; groups organize the catalog. |
| Permission → Resource/action it gates | n : m | Referenced by enforcement points and by Workflow permission grants. |

## 5. Validation Rules

- code is required, unique, and immutable; it is the contractual identifier.
- code follows the fine-grained naming convention (§6); invalid codes are rejected.
- group is required and must exist in the group vocabulary.
- A permission grants exactly one capability — no composite or "everything" permission.
- scope is set at creation and immutable (platform vs scoped semantics).
- A deprecated permission may remain referenced by old grants but cannot be granted to new
  Roles; enforcement treats it as always-deny after the deprecation date.
- Adding a permission is non-breaking; removing one requires deprecation first.

## 6. Fine-Grained Naming Convention

Permission codes are hierarchical dot-separated segments:

```
<domain>.<resource>.<action>            e.g. duplicate.review.decide
<domain>.<resource>.<action>.<qualifier> e.g. person.anonymize.request
```

- `<domain>`: module cluster (company, person, duplicate, verification, workflow…).
- `<resource>`: the subject type.
- `<action>`: the atomic verb (read, create, update, decide, approve, run, cancel…).
- `<qualifier>`: optional disambiguation where the same action needs distinct scope.

An **action** is the finest useful grain: `read` and `update` are separate permissions;
bulk vs single variants are separate only when the risk differs. Permission codes are
stable public contracts; renaming is a new permission plus deprecation.

## 7. Grouping Strategy

Groups organize the catalog along two axes:

- **By domain** (`core`, `intelligence`, `data-quality`, `automation`, `admin`,
  `integration`): the module cluster the capability serves.
- **By capability level** (`view`, `operate`, `govern`): view-only, operational, or
  privileged/governance capability.

Each permission belongs to exactly one group (group is a required lookup field). Grouping
is a management convenience: enforcement uses the permission itself, never the group.

## 8. Lifecycle

```
introduced → active → deprecated → (removed once unreferenced)
```

- **introduced**: cataloged but not yet grantable.
- **active**: grantable to roles and enforced.
- **deprecated**: no new grants; existing grants expire by policy; enforcement denies after
  the deprecation date.
- **removed**: only possible when no Role or Workflow grant references it; history retained.

## 9. Ownership

**Platform governance** owns the permission catalog. No tenant/user role can define new
permissions in v1. Workspace administrators compose permissions into roles; they cannot
create capabilities.

## 10. Security Considerations

- Deny by default: enforcement checks the exact permission; nothing is implied by group.
- Permission codes are validated against the catalog; unknown codes fail closed.
- The catalog is read-only to all non-governance actors.
- Deprecation is the safe change path: it makes a capability non-grantable before it is
  removed, preventing "orphan grants" from silently authorizing.
- Scoped permissions require a scope resolution at enforcement (owner vs platform), never
  a global grant where a scoped one suffices.

## 11. Audit Requirements

- Catalog changes (introduce, deprecate, remove) are audited with rationale.
- Every grant (RolePermission, Workflow grant) referencing a permission is audited.
- Enforcement denials may be logged for security review where policy requires.
- A permission's full grant graph is recoverable from join history.

## 12. Workflow Interaction

- A Workflow's authority is a **permission grant** attached at publish time (11-automation-job
  §10): the workflow may only perform actions whose permission it was granted.
- Automation Job enforcement resolves its workflow's grants — never the workflow owner's
  personal role.
- Permission deprecation breaks nothing silently: workflows holding a deprecated permission
  are flagged for review and re-publish.

## 13. Future Extensions

- Resource-conditional permissions (e.g., owner-only vs org-wide) via the `scope` field
  without new entities.
- Permission versions: history of a code's semantics is derivable from audit.
- External authorization policy (ABAC conditions on top of RBAC) layers onto the catalog
  without changing it.
- Granularity refinements are always additive: split a permission into two finer ones,
  deprecate the original.

## Index Strategy

- `code`: canonical uniqueness and enforcement lookup.
- `group`: catalog browsing and management.
- `status`: active/deprecated filtering.
- RolePermission by permission: grant-graph queries.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Role/Permission (with 12-role.md).
- Implements fine-grained naming, grouping strategy, and additive extensibility.
- Feeds 11-automation-job.md §10: workflow authority = permission grant, never an implicit
  role.
- Consistent with decision 1: grants live in joins, never embedded on the Role.

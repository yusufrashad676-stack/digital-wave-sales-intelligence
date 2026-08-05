# 12 — Role

Status: Draft v1.0 (Phase 4.4)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, 01-user.md (RBAC deferral), 13-permission.md, 14-workspace.md, MASTER_ARCHITECTURE.md §5

## 1. Purpose

A Role is a **named, assignable bundle of permissions** granted to Users. It is the
assignment unit of access control: permissions attach to Roles, Roles attach to Users,
and a User's effective authority is the union of its Roles' permissions.

Role resolves the deferral made in 01-user.md ("defers to auth module for Role/Permission
specifics") and closes the Identity & Access foundation required by the Audit Log actor
model and every gated action in the platform.

## 2. Responsibilities

- Group permissions into meaningful, named capabilities a User can be assigned.
- Provide built-in (system) roles for the standard operational personas.
- Support the future addition of custom roles without schema change.
- Hold optional hierarchy (inheritance) between roles, when enabled.
- Define the workspace scope in which the role applies (global or per-workspace).

## 3. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| code | code | Canonical role identifier (e.g., `admin`, `reviewer`, `researcher`). |
| name | text | Human-readable display name. |
| description | text | Intent and capability summary. |
| kind | enum | `system` (built-in, governance-managed) or `custom` (tenant/user-created). |
| hierarchy | structure | Optional parent-role reference and inheritance depth (hierarchical roles are optional). |
| status | state | `active`, `deprecated` (see Lifecycle). |
| workspaceScope | reference | Optional: applies globally or within a specific Workspace. |
| createdBy / createdAt | audit | Governance actor who created it. |
| updatedAt | timestamp | Last mutation. |
| deletedAt | timestamp | Soft-delete marker. |

## 4. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| Role → Permission | n : m | Via the RolePermission join — **permissions are never embedded on the Role**; the join is the single source of the mapping. |
| Role → User | n : m | Via the RoleAssignment join; a User holds one or more Roles. |
| Role → Role (parent) | 0 : 1 | Optional hierarchy: a role may inherit from one parent. Cycles forbidden. |
| Role → Workspace | n : 1 | Optional scope: global role vs workspace-scoped role. |

## 5. Validation Rules

- code is required and unique (canonical form); immutable after creation.
- name is required; description optional but recommended for custom roles.
- kind is immutable: a custom role can never be promoted to system.
- Hierarchical roles: a role may reference at most one parent; inheritance must be
  acyclic (cycle-guard enforced at the domain layer).
- A deprecated role may not be assigned to new Users; existing assignments are handled per
  policy.
- System roles: code and structure are governance-controlled; only permission mappings may
  change, and only through the governance workflow.
- A role without workspaceScope applies globally; a scoped role only grants authority
  within that workspace.

## 6. Lifecycle

```
created → active → deprecated → (soft-deleted once unreferenced)
```

- **created**: defined, not yet assignable.
- **active**: assignable to Users; its permission set is the granted authority.
- **deprecated**: no new assignments; existing assignments retained for a policy window.
- **soft-deleted**: only when no active assignments remain; historical assignments in audit
  stay intact.

Permission changes to an active role are additive or gated removals — never silent.

## 7. Ownership

**Platform governance** owns system roles. **Workspace governance** (future) owns custom
roles within a workspace. In v1, all roles are platform-level; custom-role creation is
governance-approved, not user-self-serve.

## 8. Security Considerations

- Least privilege by default: new roles start with zero permissions and are granted
  explicitly.
- Deny by default at the enforcement layer; absence of a permission is denial.
- No permission is ever granted directly to a User — only via a Role. This keeps the
  authority graph simple and auditable.
- Role code and kind are immutable; tampering with system roles is impossible via normal
  operations.
- Hierarchy (when used) is depth-limited to bound inheritance scope.

## 9. Audit Requirements

- Role creation, deprecation, deletion, and hierarchy changes are audited.
- Every RolePermission change is audited (who added/removed which permission, when, why).
- Every RoleAssignment change is audited (who granted/revoked which role to whom).
- Effective-authority lookups are derivable from the join history.

## 10. Future Scalability

- Custom roles are new rows in the same structure — no schema change.
- Per-workspace roles reuse the workspaceScope field, no new entities.
- Permission sets (bundles of permissions reused across roles) are a future convenience
  layered on the join.
- Role versioning (what a role granted at time T) is derivable from RolePermission audit
  history without schema change.

## 11. AI Interaction

- AI never creates, edits, or assigns roles.
- AI may *suggest* a role/policy change ("reviewer role lacks `duplicate.review.decide`")
  as an insight event; only governance actors apply it.

## 12. Workflow Interaction

- Workflow authority is derived from the workflow's **permission grant** (see
  13-permission.md §12), never from a Role the workflow happens to own.
- Workflows can query whether an actor holds a role, but cannot change assignments.
- Role change events (grant/revoke) are domain events that may notify downstream systems.

## 13. Index Strategy

- `code`: canonical uniqueness and lookup.
- `status`: active/deprecated filtering.
- RolePermission by role: authority resolution.
- RoleAssignment by user: effective-role lookup.
- workspaceScope: scoped-role queries.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: Role/Permission (with 13-permission.md).
- Resolves the 01-user.md deferral; user authority is now fully modeled.
- Follows decision 1 (explicit join tables): RolePermission and RoleAssignment are
  explicit joins, permissions are never embedded on the role.
- Prepares B5: workspaceScope is the RBAC side of the global-vs-tenant matrix.
